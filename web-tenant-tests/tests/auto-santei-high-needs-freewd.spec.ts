/**
 * 自動算定 — câu hỏi 歯科診療困難者加算 và chuỗi `freewd` kéo theo (DATA GIẢ).
 *
 * Đây là NỬA CÒN THIẾU của commit `feat(api,web-tenant): 診療入力の点数を実機の
 * getTensu と同じ結果にする`. Commit đó có hai đầu:
 *
 *   ĐẦU ĐỌC  — getTensu nhìn `freewd` của dòng 歯科診療特別対応加算 cùng ngày để
 *              tách 困難者加算1 với 加算2. `treatment-score-gettensu-parity.spec.ts`
 *              TC-5 đã phủ, nhưng nó SEED THẲNG `freewd` vào DB.
 *   ĐẦU GHI  — chỗ DUY NHẤT sinh ra `freewd` 「1」: câu hỏi mà 自動算定 bật lên cho
 *              bệnh nhân `dis_flg == 3`. ⇒ CHƯA CÓ SPEC NÀO CHẠM TỚI.
 *
 * File này khoá ĐẦU GHI: hỏi/không hỏi, hỏi lúc nào, và 「はい」 rồi thì giá trị đó
 * đi đâu (lên lưới → lượt getTensu kế tiếp → payload F9 登録).
 *
 * ĐẶC TÍNH KIỂM THỬ: mọi kỳ vọng bám THEO WINFORM (`userapp/src/OCHACOM`), không
 * bám theo code web. Test đỏ = bản port lệch, KHÔNG phải test viết sai.
 *
 * ─── FACT lấy từ source (Rule 21) ────────────────────────────────────────────
 *
 *  ・INP/Lib/modSave.cs:3448-3456 — trong vòng lặp đẩy pick của AutoSantei:
 *        else if (kv.item.Key == 105 && intSins == 3) {
 *            if (MsgBox("著しく歯科診療が困難な患者に対する加算を算定しますか？",
 *                       Question | YesNo, "特別対応加算") == Yes)
 *                hFG1[72, Y].Value = "1";     // cột 72 = trn_trn.freewd
 *        }
 *    ⇒ hỏi khi VÀ CHỈ KHI: (a) bộ pick có dòng 処置コード 105, VÀ
 *       (b) `intSins == 3`, tức `ins.dis_flg == 3` (gán ở modSave.cs:3041).
 *    ⇒ 「いいえ」 KHÔNG ghi gì cả — ô freewd giữ nguyên rỗng.
 *
 *  ・INP/Lib/modSave.cs:3080-3088 (初診) / :3141-3161 (再診) — câu hỏi 特２ nằm
 *    TRƯỚC, ở khâu dựng bộ pick; câu 困難者 nằm ở vòng ĐẨY pick, tức SAU.
 *    Điều kiện của hai câu KHÁC NHAU: 特１/特２ ra với mọi `dis_flg >= 1` (:3083 so
 *    `>=`), còn câu 困難者 chỉ ra khi `== 3`. ⇒ có dòng 105 trên lưới KHÔNG đủ để
 *    kết luận phải hỏi câu thứ hai.
 *
 *  ・INP/Lib/CommonChk.cs:100-111 — getTensu đọc ngược lại chính ô đó:
 *        không có dòng 特別対応加算 cùng ngày → disFlg = 0 (加算なし)
 *        có, freewd == "1"                   → disFlg = 1 (歯科診療困難者加算)
 *        có, freewd khác "1"                 → disFlg = 2
 *    ⇒ 「không có dòng」 và 「có dòng nhưng freewd rỗng」 là HAI nghĩa khác nhau.
 *    Vì vậy FE phải gửi `freewd: null` cho dòng chưa trả lời, chứ KHÔNG được bỏ
 *    dòng đó ra khỏi `sameDayRows`.
 *
 *  ・INP/Lib/CommonChk.cs:1224-1234 — danh sách 特別対応加算: 105/{0,1,2,3,6,7} và
 *    508/{0,1,6}. Câu hỏi ở modSave.cs:3449 CHỈ bẫy `Key == 105`, nên 508 (歯訪)
 *    không bao giờ được hỏi — cả WinForm lẫn web đều vậy.
 *
 * ─── Web port ─────────────────────────────────────────────────────────────────
 *  - GET /tenant/treatment/autosantei trả thêm cờ `highNeedsAddPrompt`
 *    (`GetAutoSanteiHandler.cs:176` = `context.DisFlg == 3`) — chính `intSins == 3`.
 *  - `runAutoSantei` (treatment-entry-detail.tsx): sau confirm 特２ mới tới
 *    `if (res.highNeedsAddPrompt)` → tìm pick `trtCd === HIGH_NEEDS_ADD_TRT_CD`
 *    (105) → `confirmDialog(ja.Q_HIGH_NEEDS_ADD)` → 「はい」 gắn
 *    `freewd = HIGH_NEEDS_ADD_FREEWD_DIFFICULT` ('1') vào ĐÚNG pick đó.
 *  - `GridRow.freewd` → `sameDayScoreRows()` (`freewd: r.freewd ?? null`) → body
 *    của POST /tenant/treatment/resolve-trt-score; và → `buildRowPayload` →
 *    POST /tenant/treatment/bulk-save.
 *
 * ─── RANH GIỚI: mock cái gì, KHÔNG mock cái gì ───────────────────────────────
 * Giống `auto-santei-cases.spec.ts`: mock ĐÚNG đường biên BE→FE. Cái đang kiểm là
 * cây quyết định của `runAutoSantei` + đường đi của `freewd` trong FE.
 * `dis_flg == 3` là việc của BE (`GetAutoSanteiHandler`) — hơn nữa dữ liệu tenant
 * demo hiện KHÔNG có bệnh nhân nào `dis_flg = 3` (chỉ 0/1/2, xem
 * `treatment-score-gettensu-parity.spec.ts` phần TEST_ALLOW_DIS_FLG_PATCH), nên
 * chạy thật thì nhánh này KHÔNG BAO GIỜ tới được. Ở đây ta dựng sẵn cờ rồi kiểm FE.
 * Việc getTensu ĐỔI ĐIỂM ra sao khi thấy freewd 「1」 thì KHÔNG mock — đó là
 * `treatment-score-gettensu-parity.spec.ts` TC-5 (chạy BE thật, DB thật).
 *
 * ─── LỆCH ĐÃ BIẾT, CỐ Ý KHÔNG DỰNG TESTCASE ─────────────────────────────────
 * WinForm đặt câu hỏi trong nhánh `else if` của `if (kv.index == 0)`, nghĩa là
 * pick ĐẦU TIÊN của bộ không bao giờ được hỏi (nó đi nhánh tô chữ đỏ). Web bỏ
 * điều kiện vị trí, chỉ tìm theo `trtCd === 105`. Không dựng testcase vì:
 *   · Với MỌI bộ pick thật, index 0 luôn là 初診料/再診料 (100/110) — 105 là 加算
 *     nên không thể đứng đầu ⇒ hai bản cho cùng kết quả.
 *   · Chính chỗ này web đã dịch `kv.index == 0` thành `INITIAL_VISIT_FEE_CODES`
 *     cho luật tô chữ đỏ, và `auto-santei-cases.spec.ts` D-5 đã chốt cách dịch đó.
 * Dựng testcase cho nhánh không thể xảy ra chỉ đẻ ra một test đỏ vĩnh viễn.
 *
 * ─── KHÔNG GHI DB ────────────────────────────────────────────────────────────
 * I-4 có bấm F9 登録 nhưng `/tenant/treatment/bulk-save` bị CHẶN và trả phản hồi
 * giả ⇒ không dòng nào chạm DB, nên spec KHÔNG cần `TEST_ALLOW_SAVE` (Rule 18.1).
 * Mọi phản hồi khác cũng là giả.
 *
 * ─── CẤU TRÚC (Rule 19) ──────────────────────────────────────────────────────
 * `serial` + MỘT page ở `beforeAll` (login 1 lần — Rule 10.1). Mỗi TC tự cài stub
 * qua `arrange()` rồi mới `goto`, nên chạy lẻ vẫn được.
 */
import { expect, test, type Page, type Route } from "@playwright/test";

import { makeStep } from "./step";
import { ADMIN_USER, JA } from "./test-data";

const BASE_URL = process.env.BASE_URL ?? "https://tenant1.ochacom.local/";
const PAT_NO = process.env.TEST_PAT_NO ?? "11";

/**
 * Ngày 処置 mặc định = HÔM NAY theo giờ máy. KHÔNG dùng `toISOString()`: nó đổi
 * sang UTC nên ở JST buổi sáng sẽ lùi một ngày, lệch với ngày lưới tự mở.
 */
const TRT_DT =
  process.env.TEST_TRT_DT ??
  (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

/** RegiCol — treatment-entry-shared.ts:105. */
const RegiCol = { day: 0, ryo: 2 } as const;
const ryoCell = (page: Page) =>
  page.locator(`[data-grid-cell$="|${RegiCol.ryo}"]`);

/** SanteiConfirmDialog (3 nút) — DraggableDialog ⇒ role `dialog` (Rule 13). */
const santeiDialog = (page: Page) =>
  page.locator('[role="dialog"]').filter({ hasText: /を算定しますか？/ });
const santeiBtn = (page: Page, label: "Yes" | "No" | "Cancel") =>
  santeiDialog(page).getByRole("button", { name: new RegExp(`^${label}$`) });

/**
 * `confirmDialog` (2 nút) — Radix AlertDialog ⇒ role **alertdialog**. Nhãn nút
 * mặc định của biến thể 2 nút là **Yes/No** tiếng Anh (confirm-dialog-view.tsx:18),
 * còn biến thể 3 nút mới là はい/いいえ/キャンセル — regex nhận cả hai (Rule 13.2).
 */
const alertDialogs = (page: Page) => page.locator('[role="alertdialog"]');
const yesBtn = (d: ReturnType<typeof alertDialogs>) =>
  d.getByRole("button", { name: /^(Yes|はい)$/ });
const noBtn = (d: ReturnType<typeof alertDialogs>) =>
  d.getByRole("button", { name: /^(No|いいえ)$/ });

/**
 * Câu hỏi 歯科診療困難者加算 — chuỗi LẤY NGUYÊN từ modSave.cs:3452 (WinForm dùng
 * MsgBox chữ sống, không có mã thông báo; web để ở `ja.Q_HIGH_NEEDS_ADD`).
 */
const HIGH_NEEDS_Q = "著しく歯科診療が困難な患者に対する加算を算定しますか？";
const highNeedsDialog = (page: Page) =>
  alertDialogs(page).filter({ hasText: HIGH_NEEDS_Q });
/** Câu hỏi 特２ — cùng role, phân biệt bằng nội dung. */
const addonDialog = (page: Page) =>
  alertDialogs(page).filter({ hasText: /を算定しますか？/ }).filter({
    hasNotText: HIGH_NEEDS_Q,
  });

/** Tên 処置 giả — tiền tố hiếm để không đụng 履歴 thật của bệnh nhân. */
const TAG = "ZZTEST";
const pick = (trtCd: number, trtSb: number, label: string, trtPt = 0) => ({
  trtCd,
  trtSb,
  trtNm: `${TAG}${label}`,
  trtPt,
  trtCnt: 1,
});

/** trt_cd 105 = 歯科診療特別対応加算 (特１/特２/特３ chung mã, khác 枝番). */
const TRT_CD_TOKU = 105;
/** trt_cd 100 = 歯科初診料 / 110 = 歯科再診料 — luôn là pick đầu bộ. */
const TRT_CD_SHOSHIN = 100;
const TRT_CD_SAISHIN = 110;
/** Giá trị freewd của 「はい」 (modSave.cs:3455 → hFG1[72] = "1"). */
const FREEWD_DIFFICULT = "1";

/** Bộ 初診 / 再診 mặc định (giống auto-santei-cases.spec.ts). */
const INITIAL_SET = [
  pick(TRT_CD_SHOSHIN, 0, "初診料"),
  pick(108, 7, "外安全1初"),
];
const REEXAM_SET = [pick(TRT_CD_SAISHIN, 0, "再診料"), pick(108, 9, "外安全1再")];

/**
 * 処置 dùng để CHỌC một lượt getTensu sau khi 自動算定 xong — cái cớ để đọc
 * `sameDayRows` mà FE gửi lên. Phải là mã tra cứu thường: KHÔNG nằm trong bộ mã
 * đặc biệt của `classifyCodeModeEntry` (1..6 自由処置, 50 IS, 101-103 加算,
 * 333 訪問, 999 未装着), nếu không コードモード sẽ rẽ nhánh khác và không hỏi master.
 */
const PROBE_TRT_CD = 401;
const PROBE_TRT_NM = "プローブ処置";
const PROBE_SCORE = 77;

interface AutoSanteiStub {
  isInitialVisitEligible: boolean;
  picks: ReturnType<typeof pick>[];
  disabilityAddon?: ReturnType<typeof pick> | null;
  reExamPicks: ReturnType<typeof pick>[];
  reExamDisabilityAddon?: ReturnType<typeof pick> | null;
  /** `GetAutoSanteiHandler` đặt cờ này khi `ins.dis_flg == 3` (= intSins == 3). */
  highNeedsAddPrompt: boolean;
}

/** Một dòng cùng ngày như FE gửi lên trong body resolve-trt-score. */
interface SameDayRowBody {
  trtCd: number;
  trtSb: number;
  freewd: string | null;
}
interface ResolveScoreBody {
  trtDt: string;
  patNo: number;
  isHouseVisit: boolean;
  items: { trtCd: number; trtSb: number }[];
  sameDayRows?: SameDayRowBody[] | null;
}
/** Một dòng trong payload F9 登録 (chỉ các cột spec này quan tâm). */
interface SaveRowBody {
  trtCd: number;
  trtSb: number;
  dspTrt: string;
  freewd?: string;
}

const filledRyoTexts = async (page: Page): Promise<string[]> =>
  (await ryoCell(page).allTextContents())
    .map((t) => t.trim())
    .filter((t) => t !== "");

/** Chỉ những dòng do STUB sinh ra — miễn nhiễm với 履歴 thật trên lưới. */
const stubRows = async (page: Page): Promise<string[]> =>
  (await filledRyoTexts(page)).filter((t) => t.includes(TAG));

test.describe.configure({ mode: "serial", timeout: 180_000 });

test.describe("自動算定 — 歯科診療困難者加算 と freewd (data giả)", () => {
  let page: Page;
  let step: () => Promise<void>;

  /**
   * Stub hiện hành. Route cài MỘT LẦN ở `beforeAll` và đọc biến này — KHÔNG
   * `unroute` giữa các TC (gỡ/cài lại lúc đang điều hướng làm hỏng request đang
   * bay và lưới không render; đã dính ở auto-santei-cases A-3).
   */
  let stub: AutoSanteiStub = {
    isInitialVisitEligible: false,
    picks: [],
    reExamPicks: [],
    highNeedsAddPrompt: false,
  };

  /** Body của MỌI lượt POST resolve-trt-score kể từ `arrange()`. */
  let resolveBodies: ResolveScoreBody[] = [];
  /** Body của MỌI lượt POST bulk-save kể từ `arrange()` (đã bị chặn, không ghi DB). */
  let saveBodies: { rows?: SaveRowBody[] }[] = [];

  /** Đặt stub rồi mở màn 診療入力 (retry vì Vite dev hay nhả hụt module). */
  const arrange = async (next: AutoSanteiStub) => {
    stub = next;
    resolveBodies = [];
    saveBodies = [];
    for (let attempt = 1; attempt <= 3; attempt++) {
      await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, {
        waitUntil: "domcontentloaded",
      });
      const ok = await ryoCell(page)
        .last()
        .waitFor({ state: "visible", timeout: 30000 })
        .then(() => true)
        .catch(() => false);
      if (ok) {
        await step();
        return;
      }
      console.log(
        `診療入力 ${PAT_NO}: lần ${attempt}/3 lưới không render → nạp lại`,
      );
    }
    throw new Error(
      `màn 診療入力 không render. Kiểm app còn sống không ` +
        `(curl -sk -o /dev/null -w "%{http_code}" ${BASE_URL}login) — 502 là dev server chết, ` +
        "KHÔNG phải lỗi test (Rule 5).",
    );
  };

  /** Chờ lưới đứng yên rồi trả về các dòng do stub sinh (Rule 10.8). */
  const settledStubRows = async (expected: number): Promise<string[]> => {
    await expect
      .poll(async () => (await stubRows(page)).length, { timeout: 15000 })
      .toBe(expected);
    return stubRows(page);
  };

  /**
   * Ép ô 点 về コードモード. Nhãn nút ĐỔI theo mode nên không match theo tên được —
   * bám `title` cố định (lbInpMode_Click, frm203002.cs:7126 ⇔
   * patient-info-header.tsx:143).
   */
  const ensureCodeMode = async () => {
    const modeBtn = page.locator('button[title^="点数/コード 入力モード切替"]');
    await expect(modeBtn, "không thấy nút đổi 入力モード").toBeVisible({
      timeout: 20000,
    });
    if ((await modeBtn.innerText()).trim() !== "コード") await modeBtn.click();
    await expect(modeBtn, "không chuyển được sang コードモード").toHaveText(
      "コード",
    );
  };

  /**
   * Gõ `PROBE_TRT_CD` vào ô 点 của dòng 日計 ở コードモード để CHỌC một lượt
   * getTensu, rồi trả về `sameDayRows` mà FE gửi kèm.
   *
   * Đây là cách đọc `freewd` từ phía trình duyệt: nó là cột ẨN, không có ô nào
   * trên lưới hiển thị nó. WinForm cũng vậy — hFG1 cột 72 không được vẽ; thứ duy
   * nhất đọc nó là getTensu (CommonChk.cs:109). Chọc đúng chỗ đó là kiểm đúng
   * cái WinForm kiểm.
   */
  const probeSameDayRows = async (): Promise<SameDayRowBody[]> => {
    resolveBodies = [];
    await ensureCodeMode();
    const footerTen = page
      .locator('input[data-footer-cell$=":footer-ten"]')
      .last();
    await expect(footerTen, "không thấy ô 点 của dòng 日計").toBeVisible({
      timeout: 20000,
    });
    await footerTen.click();
    await footerTen.fill(String(PROBE_TRT_CD));
    await footerTen.press("Enter");
    await expect
      .poll(() => resolveBodies.length, {
        message:
          "gõ 処置コード ở コードモード mà FE không gọi resolve-trt-score — " +
          "đường getTensu của コードモード đứt",
        timeout: 20000,
      })
      .toBeGreaterThan(0);
    return resolveBodies[0]!.sameDayRows ?? [];
  };

  /** Dòng 105 trong `sameDayRows` (WinForm quét NGƯỢC nên lấy dòng CUỐI). */
  const highNeedsRowOf = (rows: SameDayRowBody[]): SameDayRowBody | undefined =>
    [...rows].reverse().find((r) => Number(r.trtCd) === TRT_CD_TOKU);

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({
      baseURL: BASE_URL,
      ignoreHTTPSErrors: true,
      locale: "ja-JP",
    });
    step = makeStep(page);
    page.on("pageerror", (e) => console.log(`pageerror: ${e.message}`));

    // ── /autosantei — trái tim của spec. Cài TRƯỚC /autosantei2 vì glob
    //    `autosantei**` cũng khớp `autosantei2`; Playwright ưu tiên route cài SAU.
    await page.route(
      "**/tenant/treatment/autosantei**",
      async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {
              isInitialVisitEligible: stub.isInitialVisitEligible,
              picks: stub.picks,
              disabilityAddon: stub.disabilityAddon ?? null,
              reExamPicks: stub.reExamPicks,
              reExamDisabilityAddon: stub.reExamDisabilityAddon ?? null,
              highNeedsAddPrompt: stub.highNeedsAddPrompt,
            },
          }),
        });
      },
    );

    // 自動算定２ — luôn rỗng để số dòng kỳ vọng chỉ đến từ bộ 初再診.
    await page.route(
      "**/tenant/treatment/autosantei2",
      async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, data: { picks: [] } }),
        });
      },
    );

    // コメント自動 (CMTAUTO / programmatic / パック) — luôn rỗng để カルテ記載選択
    // không bung ra nuốt phím và không đẻ thêm dòng.
    for (const glob of [
      "**/tenant/cmt-autos?**",
      "**/tenant/cmt-autos/programmatic**",
      "**/tenant/cmt-autos/cascade**",
    ]) {
      await page.route(glob, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, data: [] }),
        });
      });
    }

    // 処置マスタ — CHỈ chặn đúng lượt tra `PROBE_TRT_CD`; mọi truy vấn khác (tab
    // 個別, …) vẫn đi ra BE thật để không bóp méo phần còn lại của màn hình.
    await page.route("**/tenant/mst-trt**", async (route: Route) => {
      const q = new URL(route.request().url()).searchParams;
      if (q.get("trtCd") !== String(PROBE_TRT_CD)) {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            items: [
              {
                trtCd: PROBE_TRT_CD,
                trtSb: 0,
                trtNm: PROBE_TRT_NM,
                cctNm: PROBE_TRT_NM,
                score1: PROBE_SCORE,
                score2: PROBE_SCORE,
                score3: PROBE_SCORE,
                f1: 0,
              },
            ],
            page: 1,
            pageSize: 100,
            totalCount: 1,
            totalPages: 1,
            hasPreviousPage: false,
            hasNextPage: false,
          },
        }),
      });
    });

    // getTensu — ghi lại body (đây là thứ spec đọc) rồi trả điểm giả.
    await page.route(
      "**/tenant/treatment/resolve-trt-score",
      async (route: Route) => {
        resolveBodies.push(
          route.request().postDataJSON() as ResolveScoreBody,
        );
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {
              items: [
                {
                  trtCd: PROBE_TRT_CD,
                  trtSb: 0,
                  found: true,
                  score: PROBE_SCORE,
                },
              ],
            },
          }),
        });
      },
    );

    // F9 登録 — CHẶN để không ghi DB; body chính là thứ I-4 kiểm.
    await page.route(
      "**/tenant/treatment/bulk-save",
      async (route: Route) => {
        saveBodies.push(
          route.request().postDataJSON() as { rows?: SaveRowBody[] },
        );
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {
              deletedCount: 0,
              insertedCount: (
                (route.request().postDataJSON() as { rows?: SaveRowBody[] })
                  .rows ?? []
              ).length,
              monthUpdatedAt: null,
            },
          }),
        });
      },
    );

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email);
    await page
      .getByLabel(JA.passwordLabel, { exact: true })
      .fill(ADMIN_USER.password);
    await page.getByRole("button", { name: JA.submit }).click();
    await expect(
      page,
      "login không vào được — có thể đang dính rate-limit, chờ ~4 phút (Rule 9 / 10.1)",
    ).toHaveURL(/\/$/);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  // ══ H. Bảng quyết định: hỏi hay không hỏi ═════════════════════════════════

  test("H-1 dis_flg ≠ 3 (highNeedsAddPrompt = false) → CÓ dòng 105 vẫn KHÔNG hỏi", async () => {
    // modSave.cs:3449 — điều kiện là `Key == 105 && intSins == 3`. 特１ ra với mọi
    // dis_flg >= 1 (:3083), nên dis_flg 1/2 vẫn có dòng 105 mà KHÔNG được hỏi.
    await arrange({
      isInitialVisitEligible: true,
      picks: [...INITIAL_SET, pick(TRT_CD_TOKU, 0, "特1初")],
      reExamPicks: REEXAM_SET,
      highNeedsAddPrompt: false,
    });
    await santeiBtn(page, "Yes").click();

    await settledStubRows(3);
    await step();
    await expect(
      highNeedsDialog(page),
      "dis_flg khác 3 mà vẫn hỏi 困難者加算 ⇒ đang gate nhầm theo sự có mặt của dòng 105",
    ).toHaveCount(0);
  });

  test("H-2 dis_flg = 3 nhưng bộ pick KHÔNG có dòng 105 → không hỏi", async () => {
    // Câu hỏi nằm TRONG vòng lặp đẩy pick: không có pick 105 thì không có lượt nào
    // chạm `Key == 105` (modSave.cs:3448).
    await arrange({
      isInitialVisitEligible: true,
      picks: INITIAL_SET,
      reExamPicks: REEXAM_SET,
      highNeedsAddPrompt: true,
    });
    await santeiBtn(page, "Yes").click();

    await settledStubRows(INITIAL_SET.length);
    await step();
    await expect(
      highNeedsDialog(page),
      "không có dòng 特別対応加算 nào để gắn freewd thì không được hỏi",
    ).toHaveCount(0);
  });

  test("H-3 dis_flg = 3 + dòng 105 → hỏi, ĐÚNG chữ WinForm, và SAU câu 特２", async () => {
    await arrange({
      isInitialVisitEligible: true,
      picks: [...INITIAL_SET, pick(TRT_CD_TOKU, 0, "特1初")],
      disabilityAddon: pick(TRT_CD_TOKU, 2, "特2初"),
      reExamPicks: REEXAM_SET,
      highNeedsAddPrompt: true,
    });
    await santeiBtn(page, "Yes").click();

    // Câu 特２ phải tới TRƯỚC (modSave.cs:3080-3088 dựng bộ pick, :3448 mới đẩy).
    const addon = addonDialog(page);
    await expect(addon, "thiếu confirm 特２").toBeVisible({ timeout: 15000 });
    await expect(addon).toContainText(`${TAG}特2初を算定しますか？`);
    await expect(
      highNeedsDialog(page),
      "câu 困難者加算 bung ra TRƯỚC câu 特２ ⇒ sai thứ tự so với modSave.cs",
    ).toHaveCount(0);
    await noBtn(addon).click();

    // Rồi mới tới câu 困難者加算 — so khớp NGUYÊN CHỮ của MsgBox (modSave.cs:3452).
    const q = highNeedsDialog(page);
    await expect(q, "thiếu confirm 歯科診療困難者加算").toBeVisible({
      timeout: 15000,
    });
    await expect(q).toContainText(HIGH_NEEDS_Q);
    await step();
    await noBtn(q).click();

    expect(await settledStubRows(3)).toEqual([
      `${TAG}初診料`,
      `${TAG}外安全1初`,
      `${TAG}特1初`,
    ]);
  });

  test("H-4 không có 特２ → chỉ hỏi MỘT câu, và đó là câu 困難者加算", async () => {
    await arrange({
      isInitialVisitEligible: true,
      picks: [...INITIAL_SET, pick(TRT_CD_TOKU, 0, "特1初")],
      reExamPicks: REEXAM_SET,
      highNeedsAddPrompt: true,
    });
    await santeiBtn(page, "Yes").click();

    const q = highNeedsDialog(page);
    await expect(q).toBeVisible({ timeout: 15000 });
    await expect(
      addonDialog(page),
      "BE không trả disabilityAddon thì không được hỏi 特２",
    ).toHaveCount(0);
    await noBtn(q).click();
    await settledStubRows(3);
  });

  test("H-5 nhánh 再診 (trả lời No) cũng hỏi khi bộ 再診 có dòng 105", async () => {
    // WinForm hỏi ở vòng đẩy pick, KHÔNG phân biệt bộ 初診 hay 再診 (modSave.cs:3448
    // nằm sau khi `bolMedTreat` đã chọn xong bộ).
    await arrange({
      isInitialVisitEligible: true,
      picks: INITIAL_SET,
      reExamPicks: [...REEXAM_SET, pick(TRT_CD_TOKU, 1, "特1再")],
      highNeedsAddPrompt: true,
    });
    await santeiBtn(page, "No").click();

    const q = highNeedsDialog(page);
    await expect(
      q,
      "bộ 再診 có dòng 特別対応加算 mà không hỏi ⇒ câu hỏi đang bị buộc vào nhánh 初診",
    ).toBeVisible({ timeout: 15000 });
    await noBtn(q).click();

    expect(await settledStubRows(3)).toEqual([
      `${TAG}再診料`,
      `${TAG}外安全1再`,
      `${TAG}特1再`,
    ]);
  });

  test("H-6 はい KHÔNG đổi dòng nào trên lưới (freewd là cột ẩn, không phải thay 処置)", async () => {
    // Khác hẳn câu 特２: 特２ THAY pick (modSave.cs:3083), còn câu này chỉ ghi
    // hFG1[72] (:3455) — bộ dòng, thứ tự và tên đều phải y nguyên.
    await arrange({
      isInitialVisitEligible: true,
      picks: [...INITIAL_SET, pick(TRT_CD_TOKU, 0, "特1初")],
      reExamPicks: REEXAM_SET,
      highNeedsAddPrompt: true,
    });
    await santeiBtn(page, "Yes").click();
    await yesBtn(highNeedsDialog(page)).click();

    expect(await settledStubRows(3)).toEqual([
      `${TAG}初診料`,
      `${TAG}外安全1初`,
      `${TAG}特1初`,
    ]);
  });

  // ══ I. freewd đi tới đâu ══════════════════════════════════════════════════

  test("I-1 はい → lượt getTensu kế tiếp mang freewd 「1」 ĐÚNG trên dòng 105", async () => {
    await arrange({
      isInitialVisitEligible: true,
      picks: [...INITIAL_SET, pick(TRT_CD_TOKU, 0, "特1初")],
      reExamPicks: REEXAM_SET,
      highNeedsAddPrompt: true,
    });
    await santeiBtn(page, "Yes").click();
    await yesBtn(highNeedsDialog(page)).click();
    await settledStubRows(3);

    const rows = await probeSameDayRows();
    const toku = highNeedsRowOf(rows);
    expect(
      toku,
      `sameDayRows không có dòng 105 — FE gửi lên: ${JSON.stringify(rows)}`,
    ).toBeTruthy();
    expect(
      { trtSb: Number(toku!.trtSb), freewd: toku!.freewd },
      "「はい」 phải ghi freewd 「1」 lên chính dòng 特別対応加算 (modSave.cs:3455)",
    ).toEqual({ trtSb: 0, freewd: FREEWD_DIFFICULT });

    // Các dòng khác KHÔNG được dính freewd — getTensu quét NGƯỢC và lấy dòng đầu
    // tiên khớp, nên một giá trị lạc chỗ đổi luôn kết quả tính điểm.
    expect(
      rows
        .filter((r) => Number(r.trtCd) !== TRT_CD_TOKU && r.freewd !== null)
        .map((r) => `${r.trtCd}/${r.trtSb}=${String(r.freewd)}`),
      "freewd lem sang dòng không phải 特別対応加算",
    ).toEqual([]);
  });

  test("I-2 いいえ → dòng 105 VẪN được gửi, với freewd null (≠ vắng dòng)", async () => {
    // CommonChk.cs:100-111 phân biệt BA trạng thái. 「いいえ」 = 有 dòng + freewd
    // rỗng → disFlg 2, KHÁC với không có dòng nào → disFlg 0. Bỏ dòng 105 ra khỏi
    // sameDayRows sẽ âm thầm biến 加算2 thành 加算なし.
    await arrange({
      isInitialVisitEligible: true,
      picks: [...INITIAL_SET, pick(TRT_CD_TOKU, 0, "特1初")],
      reExamPicks: REEXAM_SET,
      highNeedsAddPrompt: true,
    });
    await santeiBtn(page, "Yes").click();
    await noBtn(highNeedsDialog(page)).click();
    await settledStubRows(3);

    const rows = await probeSameDayRows();
    const toku = highNeedsRowOf(rows);
    expect(
      toku,
      `「いいえ」 KHÔNG được làm mất dòng 105 khỏi sameDayRows — FE gửi: ${JSON.stringify(rows)}`,
    ).toBeTruthy();
    expect(
      toku!.freewd,
      "「いいえ」 không ghi gì cả (modSave.cs:3453-3456 chỉ ghi ở nhánh Yes)",
    ).toBeNull();
  });

  test("I-3 特２ はい rồi 困難者 はい → freewd nằm trên dòng 特２ (105/2), không phải 特１", async () => {
    // 特２ THAY pick tại chỗ, sau đó câu 困難者 vẫn tìm theo trt_cd 105 nên phải
    // trúng đúng dòng vừa bị thay.
    await arrange({
      isInitialVisitEligible: true,
      picks: [...INITIAL_SET, pick(TRT_CD_TOKU, 0, "特1初")],
      disabilityAddon: pick(TRT_CD_TOKU, 2, "特2初"),
      reExamPicks: REEXAM_SET,
      highNeedsAddPrompt: true,
    });
    await santeiBtn(page, "Yes").click();
    await yesBtn(addonDialog(page)).click();
    await yesBtn(highNeedsDialog(page)).click();

    expect(await settledStubRows(3)).toEqual([
      `${TAG}初診料`,
      `${TAG}外安全1初`,
      `${TAG}特2初`,
    ]);

    const rows = await probeSameDayRows();
    const toku = highNeedsRowOf(rows);
    expect(
      toku,
      `sameDayRows không có dòng 105 — FE gửi: ${JSON.stringify(rows)}`,
    ).toBeTruthy();
    expect(
      { trtSb: Number(toku!.trtSb), freewd: toku!.freewd },
      "freewd phải đi theo dòng 特２ vừa thay chỗ 特１",
    ).toEqual({ trtSb: 2, freewd: FREEWD_DIFFICULT });
  });

  test("I-4 F9 登録 gửi freewd 「1」 lên bulk-save, chỉ trên dòng 105", async () => {
    // Chuỗi khép kín: hỏi → hFG1[72] → trn_trn.freewd. Không có bước này thì câu
    // trả lời chết theo phiên và lần mở lại getTensu sẽ tính ra 加算2.
    await arrange({
      isInitialVisitEligible: true,
      picks: [...INITIAL_SET, pick(TRT_CD_TOKU, 0, "特1初")],
      reExamPicks: REEXAM_SET,
      highNeedsAddPrompt: true,
    });
    await santeiBtn(page, "Yes").click();
    await yesBtn(highNeedsDialog(page)).click();
    await settledStubRows(3);

    await page.keyboard.press("F9");
    // 3 nút はい/いいえ/キャンセル (modSave.cs:100-132) — はい mới đi tới SaveData.
    await page
      .getByRole("button", { name: /^(はい|Yes|OK)$/ })
      .first()
      .click();
    await expect
      .poll(() => saveBodies.length, {
        message: "bấm F9 → はい mà không có lượt POST bulk-save nào",
        timeout: 30000,
      })
      .toBeGreaterThan(0);

    const rows = saveBodies[0]!.rows ?? [];
    const toku = rows.filter((r) => Number(r.trtCd) === TRT_CD_TOKU);
    expect(
      toku.length,
      `payload không có dòng 105 — dspTrt gửi lên: ${JSON.stringify(rows.map((r) => r.dspTrt))}`,
    ).toBe(1);
    expect(
      toku[0]!.freewd,
      "freewd 「1」 phải xuống tới payload F9, nếu không câu trả lời mất khi mở lại",
    ).toBe(FREEWD_DIFFICULT);

    // Dòng khác: KHÔNG gửi freewd. `buildRowPayload` để undefined ⇒ JSON bỏ hẳn
    // khoá, BE ghi "" (TrnTrnConfiguration: NOT NULL DEFAULT '').
    expect(
      rows
        .filter((r) => Number(r.trtCd) !== TRT_CD_TOKU)
        .filter((r) => r.freewd !== undefined)
        .map((r) => `${r.trtCd}/${r.trtSb}=${String(r.freewd)}`),
      "freewd lem sang dòng khác trong payload F9",
    ).toEqual([]);
  });
});
