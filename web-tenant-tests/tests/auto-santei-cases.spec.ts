/**
 * 自動算定 — bảng nhánh quyết định, kiểm bằng DATA GIẢ (`page.route`).
 *
 * File anh em `auto-santei.spec.ts` chạy trên DỮ LIỆU THẬT nên chỉ tới được một
 * nhánh: bệnh nhân demo đang đủ điều kiện 初診. Các nhánh còn lại (không đủ điều
 * kiện, bộ pick rỗng, 身障者加算, API lỗi…) phụ thuộc dữ liệu master + lịch sử
 * khám mà tenant demo không có, nên ở đây ta CHẶN `/tenant/treatment/autosantei`
 * và trả về câu trả lời tự dựng.
 *
 * ─── RANH GIỚI: mock cái gì, KHÔNG mock cái gì ───────────────────────────────
 * Mock nằm ĐÚNG ở đường biên BE→FE. Cái đang được kiểm là **cây quyết định của
 * `runAutoSantei`** (treatment-entry-detail.tsx): với một câu trả lời cho trước
 * thì hỏi hay không hỏi, áp bộ nào, chèn bao nhiêu dòng, theo thứ tự nào.
 *
 * Những thứ do BE quyết thì KHÔNG mock được một cách có ý nghĩa — mock rồi assert
 * chính là tự kiểm cái mock:
 *   · điều kiện 初診 (最終診療日 +1月 / 治療終了日 +2月 — GetAutoSanteiHandler
 *     .ComputeIsInitialVisitEligible)
 *   · thành phần bộ pick theo 施設基準 / mốc lịch 2024-06, 2024-10, 2024-12,
 *     2026-06 (BuildInitialVisitPicks / BuildReexamPicks)
 *   · lọc chk5 当月算定回数 / chk8 同月算定不可, cửa sổ 1日
 *   · 乳幼児 (< 6 tuổi), 施設 1351 → trt_sb 0 hay 1, tên theo `tre_inp_flg`
 * ⇒ Những cái đó thuộc UNIT TEST của BE (`GetAutoSanteiHandler`), không phải e2e.
 * Ở đây chúng chỉ xuất hiện gián tiếp: ta dựng sẵn kết quả rồi kiểm FE xử đúng.
 *
 * ─── FACT lấy từ source (Rule 21) ────────────────────────────────────────────
 *  - GET /tenant/treatment/autosantei → `AutoSanteiResponse`:
 *      { isInitialVisitEligible, picks[], disabilityAddon?,
 *        reExamPicks[], reExamDisabilityAddon? }
 *    mỗi pick = { trtCd, trtSb, trtNm, trtPt, trtCnt }. Envelope `{ data: … }`.
 *  - runAutoSantei (treatment-entry-detail.tsx):
 *      · `isInitialVisitEligible && monthHasTreatments` → ép 再診, KHÔNG hỏi
 *      · `isInitialVisitEligible` → hỏi 3 nút; No → reExamPicks; Cancel → return
 *      · ngược lại → áp `picks` thẳng, không hỏi
 *      · `chosenPicks.length === 0` → không chèn gì, KHÔNG hỏi 加算
 *      · `chosenAddon` → confirm thứ hai 「<tên>を算定しますか？」 (chỉ Yes/No);
 *        Yes → thay pick trt_cd 105 bằng addon
 *      · lỗi → `console.error`, im lặng, không dialog
 *      · thứ tự chèn: TẤT CẢ pick trước, rồi mới tới comment của từng pick
 *  - Mỗi pick còn kéo theo 2 lượt gọi `/tenant/cmt-autos` +
 *    `/tenant/cmt-autos/programmatic`; spec chặn cả hai, MẶC ĐỊNH trả [] để không
 *    phụ thuộc master. Nhóm TC nào cần thì nạp `cmtUser` / `cmtPrg` theo
 *    (trtCd, trtSb) — nhóm E dùng chính đường này để lái カルテ記載選択.
 *  - POST /tenant/treatment/autosantei2 → `{ picks[] }`, mỗi pick =
 *    { trtCd, trtSb, trtNm, trtPt, trtCnt, jihiFlg, bui[32], disCd[10], disSb[10],
 *    dspDis }. WinForm gọi `ModSave.AutoSantei2` NGAY SAU AutoSantei cho cùng một
 *    ngày (frm203002.cs:5345-5353): các 処置 院所 đăng ký trong TRTAUTO
 *    (歯科疾患管理料 116/7, 衛生実地指導 340/0, Ｐ処 167/4…) được tự算定. Nhóm F
 *    khoá phần FE của nó: chèn sau bộ 初再診, gửi kèm dòng chưa lưu, 部位病名行,
 *    nhánh lỗi. Điều kiện 属性/年齢/時期/必要病名/必要処置 do BE quyết → unit test
 *    của `GetAutoSantei2Handler`, không mock ở đây.
 *  - GET /tenant/cmt-autos/cascade → 摘要コメントパック (pack_type 1/90). Đây là
 *    NỬA CÒN LẠI của `Chk_CmtAuto` (modMain.cs:771-776 prgCmtAuto); nửa kia là
 *    CMTAUTO ở nhóm E. Nhóm G khoá việc đường 自動算定 cũng phải dò packs — thiếu
 *    nó thì 歯管 mất dòng 「有床義歯に係る口腔管理のみ」 (pack B000-4).
 *  - Cửa mở カルテ記載選択 (frm203012.cs:529-536 ⇔ `cmtAutoNeedsPick`,
 *    cmt-auto-api.ts:164): CHỈ bung khi CMTAUTO có ≥2 dòng VÀ ít nhất một dòng
 *    `no_chk == 0`; ngược lại tự áp hết (`fixProc`). Nhóm E khoá bảng chân trị này
 *    cùng F9 確定 / F10 戻る / hàng đợi nhiều pick / nhánh API lỗi.
 *
 * ─── KHÔNG GHI DB ────────────────────────────────────────────────────────────
 * Không 登録 lần nào; hơn nữa phản hồi là giả nên không có gì chạm DB.
 *
 * ─── CẤU TRÚC (Rule 19) ──────────────────────────────────────────────────────
 * `serial` + MỘT page ở `beforeAll` (login 1 lần — Rule 10.1). Mỗi TC tự cài
 * route của riêng nó qua `arrange()` rồi mới `goto`, nên chạy lẻ vẫn được.
 */
import { expect, test, type Page, type Route } from "@playwright/test";

import { makeStep } from "./step";
import { ADMIN_USER, JA } from "./test-data";

const BASE_URL = process.env.BASE_URL ?? "https://tenant1.ochacom.local/";
const PAT_NO = process.env.TEST_PAT_NO ?? "11";
const TRT_DT = process.env.TEST_TRT_DT ?? new Date().toISOString().slice(0, 10);

/** RegiCol — treatment-entry-shared.ts:105. */
const RegiCol = { day: 0, ryo: 2 } as const;
const ryoCell = (page: Page) =>
  page.locator(`[data-grid-cell$="|${RegiCol.ryo}"]`);
const anyDialog = (page: Page) => page.locator('[role="dialog"]');
const santeiDialog = (page: Page) =>
  anyDialog(page).filter({ hasText: /を算定しますか？/ });
const santeiBtn = (page: Page, label: "Yes" | "No" | "Cancel") =>
  santeiDialog(page).getByRole("button", { name: new RegExp(`^${label}$`) });

/**
 * Confirm 特別対応加算 — đây là `confirmDialog` (Radix AlertDialog) nên role là
 * **alertdialog**, KHÁC hẳn SanteiConfirmDialog (DraggableDialog, role=dialog).
 * Rule 13: hai loại không lẫn nhau, dùng đúng role là tách được ngay.
 * Nhãn nút để mặc định はい/いいえ nên regex nhận cả hai dạng (Rule 13.2).
 */
const addonDialog = (page: Page) => page.locator('[role="alertdialog"]');
/** Bất kỳ câu hỏi 「〜を算定しますか？」 nào, thuộc CẢ HAI loại dialog. */
const anySanteiQuestion = (page: Page) =>
  page
    .locator('[role="dialog"], [role="alertdialog"]')
    .filter({ hasText: /を算定しますか？/ });

/**
 * カルテ記載選択 — CmtAutoPickerDialog (frm203012 gType.Auto), dialog bung ra SAU
 * khi bộ pick đã được chèn xong (modSave.cs:3435-3442 → modMain.cs:787).
 *
 * Lọc theo TIÊU ĐỀ chứ không dùng `getByRole('dialog')` trần: màn 診療入力 còn
 * nhiều DraggableDialog khác cùng role (Rule 10.3).
 */
const cmtPicker = (page: Page) =>
  anyDialog(page).filter({ hasText: "カルテ記載選択" });
/** Các dòng カルテコメント一覧 trong picker (VirtualListTable → testid cell-<colId>). */
const cmtPickerRows = (page: Page) => cmtPicker(page).getByTestId("cell-cmtNm");
/** Textarea 記載内容 — không label/placeholder/testid, bắt bằng tag trong dialog. */
const cmtPickerText = (page: Page) => cmtPicker(page).locator("textarea");
const cmtPickerBtn = (page: Page, label: "確定" | "戻る") =>
  cmtPicker(page).getByRole("button", { name: new RegExp(label) });

/**
 * Tên 処置 giả — tiền tố hiếm gặp để không đụng 履歴 thật của bệnh nhân
 * (lưới hiển thị cả các tháng trước, xem auto-santei.spec.ts).
 */
const TAG = "ZZTEST";
const pick = (trtCd: number, trtSb: number, label: string, trtPt = 0) => ({
  trtCd,
  trtSb,
  trtNm: `${TAG}${label}`,
  trtPt,
  trtCnt: 1,
});

/**
 * Một dòng CMTAUTO giả. `noChk` chính là cột `no_chk` của bảng: frm203012.cs:536
 * bỏ qua dialog và tự áp khi `dt.Rows.Count == 1 || flgNoChk == true`, trong đó
 * `flgNoChk` chỉ còn `true` khi KHÔNG dòng nào có `no_chk == 0` (:529-535).
 * ⇒ dialog chỉ bung khi CÓ ≥2 dòng VÀ ít nhất một dòng `no_chk == 0`.
 */
const cmt = (cmtSb: number, label: string, noChk = 0) => ({
  cmtCd: 7000,
  cmtSb,
  cmtNm: `${TAG}${label}`,
  dispNo: 1,
  noChk,
});

/**
 * Một pick của 自動算定２. `bui` rỗng = 処置 không cần 部位 (歯管 của tenant demo);
 * `bui` có răng ⇒ FE phải vẽ thêm một 部位病名行 phía trên (DispAutoBuiDraw,
 * modSave.cs:4539-4592).
 */
const auto2Pick = (
  trtCd: number,
  trtSb: number,
  label: string,
  trtPt = 0,
  site?: { bui: number[]; disCd: number[]; dspDis: string },
) => ({
  trtCd,
  trtSb,
  trtNm: `${TAG}${label}`,
  trtPt,
  trtCnt: 1,
  jihiFlg: 0,
  bui: site?.bui ?? [],
  disCd: site?.disCd ?? [],
  disSb: [],
  dspDis: site?.dspDis ?? "",
});

/**
 * Một 摘要コメントパック pack_type 1 với `n` ứng viên. Một ứng viên ⇒ frm203018 tự
 * áp (treatment-entry-detail.tsx:3476-3488 ⇔ frm203018.cs:322); nhiều hơn ⇒ mở
 * dialog chọn.
 */
const cascadePack = (
  packCd: string,
  labels: string[],
  condition: string | null = null,
) => ({
  packCd,
  packNm: `${TAG}${packCd}`,
  remarks: "",
  multiSelect: false,
  direct: false,
  candidates: labels.map((label, i) => ({
    seqNo: i + 1,
    dispText: `${TAG}${label}`,
    comCd: "820101879",
    comPattern: 20,
    cmtCd: null,
    cmtSb: null,
    fmtStr: "",
    exitFlg: false,
  })),
  packType: 1,
  commentText: null,
  condition,
  gateTrtCds: [],
});

/** trt_cd 116/7 = 歯科疾患管理料 — 処置 mà tenant demo đăng ký trong TRTAUTO. */
const TRT_CD_SHIKAN = 116;
const TRT_SB_SHIKAN = 7;

/** trt_cd 105 = 特別対応加算; addon 特２ thay thế 特１ khi trả lời Yes. */
const TRT_CD_TOKU = 105;
/** trt_cd 100 = 歯科初診料 → dòng chữ đỏ (INITIAL_VISIT_FEE_CODES). */
const TRT_CD_SHOSHIN = 100;
/** trt_cd 110 = 歯科再診料. */
const TRT_CD_SAISHIN = 110;

interface AutoSanteiStub {
  isInitialVisitEligible: boolean;
  picks: ReturnType<typeof pick>[];
  disabilityAddon?: ReturnType<typeof pick> | null;
  reExamPicks: ReturnType<typeof pick>[];
  reExamDisabilityAddon?: ReturnType<typeof pick> | null;
}

/** Bộ 初診 mặc định: 歯科初診料 + 1 加算. */
const INITIAL_SET = [
  pick(TRT_CD_SHOSHIN, 0, "初診料"),
  pick(108, 7, "外安全1初", 12),
];
/** Bộ 再診 mặc định. */
const REEXAM_SET = [
  pick(TRT_CD_SAISHIN, 0, "再診料"),
  pick(108, 9, "外安全1再", 5),
];

const filledRyoTexts = async (page: Page): Promise<string[]> =>
  (await ryoCell(page).allTextContents())
    .map((t) => t.trim())
    .filter((t) => t !== "");

/** Chỉ những dòng do STUB sinh ra — miễn nhiễm với 履歴 thật trên lưới. */
const stubRows = async (page: Page): Promise<string[]> =>
  (await filledRyoTexts(page)).filter((t) => t.includes(TAG));

test.describe.configure({ mode: "serial", timeout: 180_000 });

test.describe("自動算定 — bảng nhánh (data giả)", () => {
  let page: Page;
  let step: () => Promise<void>;

  /**
   * Stub hiện hành. Route được cài MỘT LẦN ở `beforeAll` và đọc biến này —
   * KHÔNG `unroute` giữa các TC: gỡ/cài lại route trong lúc điều hướng làm hỏng
   * request đang bay và lưới không render (đã dính ở A-3).
   * Cùng cách làm với agent-linkage-settings.spec.ts.
   */
  let stub: AutoSanteiStub | { httpError: number } = {
    isInitialVisitEligible: false,
    picks: [],
    reExamPicks: [],
  };

  /** URL của lượt gọi /autosantei gần nhất — để soi tham số `existing` (bảng D10). */
  let lastAutoSanteiUrl = "";
  /** コメント自動 giả theo (trtCd, trtSb): 'user' = CMTAUTO, 'prg' = programmatic. */
  let cmtUser: Record<
    string,
    {
      cmtCd: number;
      cmtSb: number;
      cmtNm: string;
      dispNo: number;
      noChk: number;
    }[]
  > = {};
  let cmtPrg: Record<
    string,
    { trtCd: number; trtSb: number; trtNm: string }[]
  > = {};
  /** Khác null ⇒ mọi lượt `/tenant/cmt-autos` trả mã lỗi này (bảng E7). */
  let cmtHttpError: number | null = null;
  /** Phản hồi giả của POST /tenant/treatment/autosantei2 (nhóm F). */
  let auto2: { picks: ReturnType<typeof auto2Pick>[] } | { httpError: number } =
    { picks: [] };
  /** Body của lượt gọi /autosantei2 gần nhất — để soi `rows` FE gửi lên. */
  let lastAuto2Body: {
    patNo?: number;
    trtDt?: string;
    rows?: { trtCd: number; trtSb: number; day: number }[];
  } | null = null;
  /** 摘要コメントパック giả theo (trtCd, trtSb) — mặc định [] (nhóm G). */
  let cascade: Record<string, ReturnType<typeof cascadePack>[]> = {};
  /** URL mọi lượt /tenant/cmt-autos/cascade kể từ `arrange()` — soi patNo/disCd. */
  let cascadeUrls: string[] = [];

  /** Đặt stub rồi mở màn 診療入力 (có retry vì Vite dev hay nhả hụt module). */
  const arrange = async (next: AutoSanteiStub | { httpError: number }) => {
    stub = next;
    cmtUser = {};
    cmtPrg = {};
    cmtHttpError = null;
    lastAutoSanteiUrl = "";
    auto2 = { picks: [] };
    lastAuto2Body = null;
    cascade = {};
    cascadeUrls = [];
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

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({
      baseURL: BASE_URL,
      ignoreHTTPSErrors: true,
      locale: "ja-JP",
    });
    step = makeStep(page);
    page.on("pageerror", (e) => console.log(`pageerror: ${e.message}`));

    // Route cài một lần, đọc `stub` tại thời điểm request đến.
    await page.route(
      "**/tenant/treatment/autosantei**",
      async (route: Route) => {
        lastAutoSanteiUrl = route.request().url();
        if ("httpError" in stub) {
          await route.fulfill({
            status: stub.httpError,
            contentType: "application/json",
            body: "{}",
          });
          return;
        }
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
            },
          }),
        });
      },
    );

    // コメント自動: mặc định trả [] để カルテ記載選択 (frm203012 Auto) không bung
    // ra nuốt phím; TC nào cần thì nạp `cmtUser` / `cmtPrg` theo (trtCd, trtSb).
    const keyOf = (u: string) => {
      const q = new URL(u).searchParams;
      return `${q.get("trtCd")}-${q.get("trtSb")}`;
    };
    await page.route("**/tenant/cmt-autos?**", async (route: Route) => {
      if (cmtHttpError !== null) {
        await route.fulfill({
          status: cmtHttpError,
          contentType: "application/json",
          body: "{}",
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: cmtUser[keyOf(route.request().url())] ?? [],
        }),
      });
    });
    await page.route(
      "**/tenant/cmt-autos/programmatic**",
      async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: cmtPrg[keyOf(route.request().url())] ?? [],
          }),
        });
      },
    );

    // 自動算定２ — mặc định KHÔNG算定 gì để các nhóm A..E giữ nguyên số dòng kỳ
    // vọng; nhóm F/G tự nạp `auto2`. Chặn cả ở đây (thay vì để gọi thật) vì kết
    // quả thật phụ thuộc mst_trt_auto của tenant.
    await page.route(
      "**/tenant/treatment/autosantei2",
      async (route: Route) => {
        lastAuto2Body = route.request().postDataJSON() as typeof lastAuto2Body;
        if ("httpError" in auto2) {
          await route.fulfill({
            status: auto2.httpError,
            contentType: "application/json",
            body: "{}",
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true, data: { picks: auto2.picks } }),
        });
      },
    );

    // 摘要コメントパック — mặc định [] (không pack nào), nhóm G tự nạp `cascade`.
    await page.route("**/tenant/cmt-autos/cascade**", async (route: Route) => {
      const url = route.request().url();
      cascadeUrls.push(url);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: cascade[keyOf(url)] ?? [],
        }),
      });
    });

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

  // ══ A. CÓ confirm ═════════════════════════════════════════════════════════
  test("A-1 đủ điều kiện 初診 → hỏi, và câu hỏi mang tên pick ĐẦU TIÊN", async () => {
    await arrange({
      isInitialVisitEligible: true,
      picks: INITIAL_SET,
      reExamPicks: REEXAM_SET,
    });

    await expect(santeiDialog(page)).toBeVisible({ timeout: 20000 });
    // runAutoSantei dựng message từ `res.picks[0].trtNm`.
    await expect(
      santeiDialog(page),
      "câu hỏi phải mang tên pick đầu tiên của bộ 初診",
    ).toContainText(`${TAG}初診料を算定しますか？`);
    expect(
      await stubRows(page),
      "chưa trả lời thì chưa được chèn dòng nào",
    ).toEqual([]);
  });

  test("A-2 Yes → áp bộ 初診 nguyên vẹn, đúng thứ tự", async () => {
    await arrange({
      isInitialVisitEligible: true,
      picks: INITIAL_SET,
      reExamPicks: REEXAM_SET,
    });
    await santeiBtn(page, "Yes").click();

    const rows = await settledStubRows(INITIAL_SET.length);
    expect(rows, "thứ tự dòng phải khớp thứ tự pick BE trả về").toEqual([
      `${TAG}初診料`,
      `${TAG}外安全1初`,
    ]);
  });

  test("A-3 No → áp bộ 再診, không dính dòng nào của bộ 初診", async () => {
    await arrange({
      isInitialVisitEligible: true,
      picks: INITIAL_SET,
      reExamPicks: REEXAM_SET,
    });
    await santeiBtn(page, "No").click();

    const rows = await settledStubRows(REEXAM_SET.length);
    expect(rows).toEqual([`${TAG}再診料`, `${TAG}外安全1再`]);
  });

  test("A-4 Cancel → không chèn gì", async () => {
    await arrange({
      isInitialVisitEligible: true,
      picks: INITIAL_SET,
      reExamPicks: REEXAM_SET,
    });
    await santeiBtn(page, "Cancel").click();
    await expect(santeiDialog(page)).toHaveCount(0, { timeout: 10000 });
    await step();

    expect(await stubRows(page), "Cancel = return -1, không tính gì").toEqual(
      [],
    );
  });

  // ══ B. KHÔNG hỏi, vẫn tự tính ═════════════════════════════════════════════
  test("B-1 không đủ điều kiện 初診 → áp thẳng picks, KHÔNG hỏi", async () => {
    await arrange({
      isInitialVisitEligible: false,
      // Khi không đủ điều kiện, BE đã trả sẵn bộ 再診 trong `picks`.
      picks: REEXAM_SET,
      reExamPicks: REEXAM_SET,
    });

    const rows = await settledStubRows(REEXAM_SET.length);
    expect(rows).toEqual([`${TAG}再診料`, `${TAG}外安全1再`]);
    await expect(
      santeiDialog(page),
      "không đủ điều kiện 初診 thì tuyệt đối không được hỏi",
    ).toHaveCount(0);
  });

  // ══ C. Không sinh dòng nào ════════════════════════════════════════════════
  test("C-1 bộ pick rỗng → không chèn, không hỏi 加算", async () => {
    await arrange({
      isInitialVisitEligible: false,
      picks: [],
      reExamPicks: [],
      // Có addon nhưng picks rỗng ⇒ nhánh addon nằm TRONG `if (chosenPicks.length > 0)`
      // nên không được hỏi.
      disabilityAddon: pick(TRT_CD_TOKU, 3, "特2再"),
      reExamDisabilityAddon: pick(TRT_CD_TOKU, 3, "特2再"),
    });
    await step();

    expect(await stubRows(page)).toEqual([]);
    await expect(
      anySanteiQuestion(page),
      "pick rỗng thì không được hỏi 加算",
    ).toHaveCount(0);
  });

  test("C-2 API lỗi → im lặng, không dialog, không dòng", async () => {
    await arrange({ httpError: 500 });
    await step();

    // runAutoSantei bọc toàn bộ trong try/catch và chỉ `console.error` — người
    // dùng KHÔNG thấy thông báo nào. Ở đây chỉ assert phần app cam kết (không
    // dialog, không dòng); KHÔNG assert nội dung console vì react-query retry
    // làm thời điểm lỗi nổi lên không tất định (Rule 15).
    await expect(
      anySanteiQuestion(page),
      "lỗi API thì không được bung dialog nào",
    ).toHaveCount(0);
    expect(
      await stubRows(page),
      "lỗi API thì không được chèn dòng nào",
    ).toEqual([]);
  });

  // ══ D. Trường hợp đặc biệt ════════════════════════════════════════════════
  test("D-1 身障者 → confirm THỨ HAI, Yes thay 特１ bằng 特２", async () => {
    await arrange({
      isInitialVisitEligible: true,
      picks: [...INITIAL_SET, pick(TRT_CD_TOKU, 0, "特1初")],
      disabilityAddon: pick(TRT_CD_TOKU, 2, "特2初"),
      reExamPicks: REEXAM_SET,
    });

    // Confirm 初診 trước.
    await santeiBtn(page, "Yes").click();

    // Rồi mới tới confirm 加算 — chỉ Yes/No (confirmDialog), KHÔNG có Cancel.
    const addon = addonDialog(page);
    await expect(addon, "phải hỏi tiếp về 特２ sau khi chốt 初診").toBeVisible({
      timeout: 15000,
    });
    await expect(addon).toContainText(`${TAG}特2初を算定しますか？`);
    await step();
    await addon.getByRole("button", { name: /^(Yes|はい)$/ }).click();

    const rows = await settledStubRows(3);
    expect(rows, "特１ phải bị THAY bằng 特２ tại đúng vị trí cũ").toEqual([
      `${TAG}初診料`,
      `${TAG}外安全1初`,
      `${TAG}特2初`,
    ]);
  });

  test("D-2 身障者 → No thì giữ 特１", async () => {
    await arrange({
      isInitialVisitEligible: true,
      picks: [...INITIAL_SET, pick(TRT_CD_TOKU, 0, "特1初")],
      disabilityAddon: pick(TRT_CD_TOKU, 2, "特2初"),
      reExamPicks: REEXAM_SET,
    });
    await santeiBtn(page, "Yes").click();

    const addon = addonDialog(page);
    await expect(addon).toBeVisible({ timeout: 15000 });
    await expect(addon).toContainText(`${TAG}特2初を算定しますか？`);
    await addon.getByRole("button", { name: /^(No|いいえ)$/ }).click();

    const rows = await settledStubRows(3);
    expect(rows, "No → giữ nguyên 特１ (mặc định của WinForm)").toEqual([
      `${TAG}初診料`,
      `${TAG}外安全1初`,
      `${TAG}特1初`,
    ]);
  });

  test("D-3 addon của nhánh 再診 dùng reExamDisabilityAddon", async () => {
    await arrange({
      isInitialVisitEligible: true,
      picks: [...INITIAL_SET, pick(TRT_CD_TOKU, 0, "特1初")],
      disabilityAddon: pick(TRT_CD_TOKU, 2, "特2初"),
      reExamPicks: [...REEXAM_SET, pick(TRT_CD_TOKU, 1, "特1再")],
      reExamDisabilityAddon: pick(TRT_CD_TOKU, 3, "特2再"),
    });
    // Trả lời No cho 初診 → phải chuyển sang addon của bộ 再診, KHÔNG phải 特2初.
    await santeiBtn(page, "No").click();

    const addon = addonDialog(page);
    await expect(addon).toBeVisible({ timeout: 15000 });
    await expect(
      addon,
      "chọn No thì addon phải là 特２(再診), không được lấy addon của bộ 初診",
    ).toContainText(`${TAG}特2再を算定しますか？`);
    await addon.getByRole("button", { name: /^(Yes|はい)$/ }).click();

    const rows = await settledStubRows(3);
    expect(rows).toEqual([`${TAG}再診料`, `${TAG}外安全1再`, `${TAG}特2再`]);
  });

  test("D-4 không có addon → chỉ hỏi MỘT lần", async () => {
    await arrange({
      isInitialVisitEligible: true,
      picks: INITIAL_SET,
      reExamPicks: REEXAM_SET,
    });
    await santeiBtn(page, "Yes").click();
    await settledStubRows(INITIAL_SET.length);
    await step();

    await expect(
      anySanteiQuestion(page),
      "dis_flg = 0 thì không được hỏi lần hai",
    ).toHaveCount(0);
  });

  test("D-5 dòng 初診料 (trt_cd 100) hiển thị chữ đỏ", async () => {
    await arrange({
      isInitialVisitEligible: true,
      picks: INITIAL_SET,
      reExamPicks: REEXAM_SET,
    });
    await santeiBtn(page, "Yes").click();
    await settledStubRows(INITIAL_SET.length);

    // INITIAL_VISIT_FEE_CODES = {100,107,110,111,333} → 'text-red-600 font-medium'.
    const shoshin = ryoCell(page)
      .filter({ hasText: `${TAG}初診料` })
      .last();
    await expect(shoshin).toHaveClass(/text-red-600/);
    // 加算 thường thì không.
    const kasan = ryoCell(page)
      .filter({ hasText: `${TAG}外安全1初` })
      .last();
    await expect(kasan).not.toHaveClass(/text-red-600/);
  });

  test("D-6 bộ nhiều pick giữ NGUYÊN thứ tự BE trả về", async () => {
    // WinForm đẩy toàn bộ pick theo đúng thứ tự rồi mới tới comment từng pick —
    // không xen kẽ, không sắp lại.
    const many = [
      pick(TRT_CD_SHOSHIN, 0, "A初診料"),
      pick(108, 7, "B外安全"),
      pick(108, 20, "C外感染1"),
      pick(108, 21, "D外感染2"),
      pick(104, 0, "E乳初診"),
    ];
    await arrange({
      isInitialVisitEligible: true,
      picks: many,
      reExamPicks: REEXAM_SET,
    });
    await santeiBtn(page, "Yes").click();

    const rows = await settledStubRows(many.length);
    expect(rows).toEqual(many.map((p) => p.trtNm));
  });

  // ── Bảng D14/D15: fan-out コメント自動 sau MỖI pick ─────────────────────────
  test("D-7 コメント自動 nằm SAU toàn bộ pick, gom theo từng pick (bảng D14/D15)", async () => {
    await arrange({
      isInitialVisitEligible: true,
      picks: INITIAL_SET,
      reExamPicks: REEXAM_SET,
    });
    // 1 comment cho pick #1, 1 cho pick #2 — mỗi cái chỉ MỘT dòng nên tự áp
    // luôn, không mở カルテ記載選択 (frm203012.cs:536).
    cmtUser[`${TRT_CD_SHOSHIN}-0`] = [
      { cmtCd: 7000, cmtSb: 0, cmtNm: `${TAG}cmt初診`, dispNo: 1, noChk: 1 },
    ];
    cmtUser["108-7"] = [
      { cmtCd: 7000, cmtSb: 1, cmtNm: `${TAG}cmt安全`, dispNo: 1, noChk: 1 },
    ];
    await santeiBtn(page, "Yes").click();

    const rows = await settledStubRows(4);
    // WinForm chạy HAI vòng: vòng 1 đẩy hết pick, vòng 2 mới fan-out comment —
    // nên comment KHÔNG xen giữa các pick (modSave.cs:3239-3392 / 3435-3442).
    expect(rows).toEqual([
      `${TAG}初診料`,
      `${TAG}外安全1初`,
      `${TAG}cmt初診`,
      `${TAG}cmt安全`,
    ]);
  });

  test("D-8 trong một pick: programmatic trước, CMTAUTO sau (modMain.cs:774-787)", async () => {
    await arrange({
      isInitialVisitEligible: true,
      picks: [INITIAL_SET[0]!],
      reExamPicks: REEXAM_SET,
    });
    cmtPrg[`${TRT_CD_SHOSHIN}-0`] = [
      { trtCd: 6, trtSb: 0, trtNm: `${TAG}prg` },
    ];
    cmtUser[`${TRT_CD_SHOSHIN}-0`] = [
      { cmtCd: 7000, cmtSb: 0, cmtNm: `${TAG}user`, dispNo: 1, noChk: 1 },
    ];
    await santeiBtn(page, "Yes").click();

    const rows = await settledStubRows(3);
    expect(rows).toEqual([`${TAG}初診料`, `${TAG}prg`, `${TAG}user`]);
  });

  // ── Bảng D10: FE gửi kèm dòng CHƯA lưu ────────────────────────────────────
  test("D-9 lượt gọi khi mở màn KHÔNG kèm dòng nào (lưới tháng còn trống)", async () => {
    await arrange({
      isInitialVisitEligible: true,
      picks: INITIAL_SET,
      reExamPicks: REEXAM_SET,
    });
    await expect(santeiDialog(page)).toBeVisible({ timeout: 20000 });

    const existing = new URL(lastAutoSanteiUrl).searchParams.get("existing");
    expect(
      existing ?? "",
      "mở màn khi tháng chưa có 処置 thì `existing` phải rỗng — BE sẽ dùng số đếm từ DB",
    ).toBe("");
  });

  test("D-10 thêm ngày mới thì gửi kèm dòng CHƯA lưu, đúng thứ tự dòng lưới", async () => {
    await arrange({
      isInitialVisitEligible: true,
      picks: INITIAL_SET,
      reExamPicks: REEXAM_SET,
    });
    await santeiBtn(page, "Yes").click();
    await settledStubRows(INITIAL_SET.length);

    // Thêm một ngày khác → lượt gọi thứ hai phải mang theo 2 dòng vừa chèn
    // (chưa 登録) dưới dạng "trtCd-trtSb-day", theo THỨ TỰ DÒNG chứ không sort ngày.
    const today = Number(TRT_DT.slice(8, 10));
    const otherDay = today === 1 ? 2 : 1;
    await page
      .locator('[data-footer-cell$=":footer-day"]')
      .last()
      .fill(String(otherDay));
    await page.keyboard.press("Enter");

    await expect
      .poll(
        () =>
          new URL(lastAutoSanteiUrl || BASE_URL).searchParams.get("trtDt") ??
          "",
        {
          timeout: 15000,
        },
      )
      .toContain(String(otherDay).padStart(2, "0"));

    const existing =
      new URL(lastAutoSanteiUrl).searchParams.get("existing") ?? "";
    expect(
      existing,
      "phải gửi kèm 2 dòng chưa lưu để BE đếm được chk5/chk8 trên lưới sống",
    ).toBe(`${TRT_CD_SHOSHIN}-0-${today},108-7-${today}`);
  });

  // ══ E. カルテ記載選択 (CMTAUTO cần người chọn) ═════════════════════════════
  //
  // Nhánh mà cả hai file spec cũ đều KHÔNG chạm: sau khi bộ pick được áp,
  // `modMain.Chk_CmtAuto` (modMain.cs:787) mở frm203012 cho từng 処置 có CMTAUTO
  // cần xác nhận. Cửa quyết định nằm ở frm203012.cs:529-536:
  //
  //     for (…) if (no_chk == "0") { flgNoChk = false; break; }
  //     if (dt.Rows.Count == 1 || flgNoChk == true) { … fixProc(wk); }   ← TỰ ÁP
  //
  // ⇒ dialog CHỈ bung khi ≥2 dòng VÀ có ít nhất một dòng `no_chk == 0`
  // (chính là `cmtAutoNeedsPick`, cmt-auto-api.ts:164).
  //
  // Ba nhánh E-1/E-2/E-3 khoá đúng bảng chân trị đó; E-4..E-6 khoá hành vi sau
  // khi dialog đã bung; E-7 khoá cái bẫy im lặng.

  test("E-1 CMTAUTO ≥2 dòng có no_chk=0 → カルテ記載選択 BUNG, và bung SAU khi đã áp đủ pick", async () => {
    await arrange({
      isInitialVisitEligible: true,
      picks: INITIAL_SET,
      reExamPicks: REEXAM_SET,
    });
    cmtUser[`${TRT_CD_SHOSHIN}-0`] = [
      cmt(0, "cmtA"),
      cmt(1, "cmtB"),
      cmt(2, "cmtC"),
    ];
    await santeiBtn(page, "Yes").click();

    await expect(
      cmtPicker(page),
      "CMTAUTO 3 dòng đều no_chk=0 → frm203012 phải bung (frm203012.cs:536 KHÔNG vào nhánh tự áp)",
    ).toBeVisible({ timeout: 20000 });

    // Đúng danh sách BE trả về, không thừa không thiếu.
    await expect(cmtPickerRows(page)).toHaveCount(3);
    // 処置名 ở giữa dialog = lblName của frm203012 (trtCd/trtSb đang xử lý).
    await expect(cmtPicker(page)).toContainText(`${TAG}初診料`);
    // Textarea khởi tạo rỗng (initProc) — chưa chọn dòng nào.
    expect(await cmtPickerText(page).inputValue()).toBe("");

    // Dialog bung SAU vòng đẩy pick (modSave.cs:3239-3392 rồi mới 3435-3442):
    // lưới đã có ĐỦ 2 pick và CHƯA có dòng comment nào.
    expect(await stubRows(page)).toEqual([`${TAG}初診料`, `${TAG}外安全1初`]);
  });

  test("E-2 CMTAUTO đúng 1 dòng (kể cả no_chk=0) → KHÔNG bung, tự áp luôn", async () => {
    await arrange({
      isInitialVisitEligible: true,
      picks: INITIAL_SET,
      reExamPicks: REEXAM_SET,
    });
    // `dt.Rows.Count == 1` là vế ĐẦU của điều kiện tự áp — no_chk không còn ý nghĩa.
    cmtUser[`${TRT_CD_SHOSHIN}-0`] = [cmt(0, "cmtDuy", 0)];
    await santeiBtn(page, "Yes").click();

    const rows = await settledStubRows(3);
    expect(rows, "1 dòng thì áp thẳng xuống lưới, ngay sau bộ pick").toEqual([
      `${TAG}初診料`,
      `${TAG}外安全1初`,
      `${TAG}cmtDuy`,
    ]);
    await expect(
      cmtPicker(page),
      "1 dòng mà vẫn bung dialog là sai frm203012.cs:536",
    ).toHaveCount(0);
  });

  test("E-3 CMTAUTO ≥2 dòng nhưng TẤT CẢ no_chk≠0 → KHÔNG bung, áp cả cụm", async () => {
    await arrange({
      isInitialVisitEligible: true,
      picks: INITIAL_SET,
      reExamPicks: REEXAM_SET,
    });
    // flgNoChk giữ nguyên true ⇒ nhánh fixProc gom TẤT CẢ dòng, mỗi dòng một 行.
    cmtUser[`${TRT_CD_SHOSHIN}-0`] = [cmt(0, "cmtX", 1), cmt(1, "cmtY", 2)];
    await santeiBtn(page, "Yes").click();

    const rows = await settledStubRows(4);
    expect(rows).toEqual([
      `${TAG}初診料`,
      `${TAG}外安全1初`,
      `${TAG}cmtX`,
      `${TAG}cmtY`,
    ]);
    await expect(cmtPicker(page)).toHaveCount(0);
  });

  test("E-4 F9 確定 chèn ĐÚNG dòng đã chọn, xuống CUỐI ngày (sau toàn bộ pick)", async () => {
    await arrange({
      isInitialVisitEligible: true,
      picks: INITIAL_SET,
      reExamPicks: REEXAM_SET,
    });
    cmtUser[`${TRT_CD_SHOSHIN}-0`] = [
      cmt(0, "cmtA"),
      cmt(1, "cmtB"),
      cmt(2, "cmtC"),
    ];
    await santeiBtn(page, "Yes").click();
    await expect(cmtPicker(page)).toBeVisible({ timeout: 20000 });

    // Double-click = frm203012 dgvView_CellDoubleClick → defData: đẩy dòng vào
    // textarea. Chọn dòng thứ HAI để chứng minh không phải "lấy dòng đầu".
    await cmtPickerRows(page).nth(1).dblclick();
    await expect
      .poll(async () => cmtPickerText(page).inputValue(), { timeout: 10000 })
      .toBe(`${TAG}cmtB`);
    await step();

    await cmtPickerBtn(page, "確定").click();
    await expect(cmtPicker(page), "F9 確定 phải đóng dialog").toHaveCount(0, {
      timeout: 10000,
    });

    const rows = await settledStubRows(3);
    expect(rows, "comment nằm SAU cả bộ pick, không xen giữa").toEqual([
      `${TAG}初診料`,
      `${TAG}外安全1初`,
      `${TAG}cmtB`,
    ]);
  });

  test("E-5 F10 戻る → không chèn comment nào, bộ pick vẫn nguyên", async () => {
    await arrange({
      isInitialVisitEligible: true,
      picks: INITIAL_SET,
      reExamPicks: REEXAM_SET,
    });
    cmtUser[`${TRT_CD_SHOSHIN}-0`] = [cmt(0, "cmtA"), cmt(1, "cmtB")];
    await santeiBtn(page, "Yes").click();
    await expect(cmtPicker(page)).toBeVisible({ timeout: 20000 });

    await cmtPickerBtn(page, "戻る").click();
    await expect(cmtPicker(page)).toHaveCount(0, { timeout: 10000 });
    await step();

    expect(
      await stubRows(page),
      "戻る chỉ bỏ phần chọn comment — bộ pick đã chèn thì phải giữ",
    ).toEqual([`${TAG}初診料`, `${TAG}外安全1初`]);
  });

  test("E-6 nhiều pick cùng cần chọn → dialog xếp hàng TUẦN TỰ theo thứ tự pick", async () => {
    await arrange({
      isInitialVisitEligible: true,
      picks: INITIAL_SET,
      reExamPicks: REEXAM_SET,
    });
    // WinForm lặp `foreach (var kv in kvTreat)` nên mỗi 処置 mở dialog của nó,
    // lần lượt, theo đúng thứ tự pick (modSave.cs:3435-3442).
    cmtUser[`${TRT_CD_SHOSHIN}-0`] = [cmt(0, "cmtSho1"), cmt(1, "cmtSho2")];
    cmtUser["108-7"] = [cmt(2, "cmtAnzen1"), cmt(3, "cmtAnzen2")];
    await santeiBtn(page, "Yes").click();

    await expect(cmtPicker(page)).toBeVisible({ timeout: 20000 });
    await expect(
      cmtPicker(page),
      "dialog ĐẦU phải là của pick đầu tiên",
    ).toContainText(`${TAG}初診料`);
    await cmtPickerBtn(page, "戻る").click();

    // Đóng cái thứ nhất thì cái thứ hai tự lên, KHÔNG mất.
    await expect(cmtPicker(page)).toBeVisible({ timeout: 20000 });
    await expect(
      cmtPicker(page),
      "dialog THỨ HAI phải là của pick thứ hai",
    ).toContainText(`${TAG}外安全1初`);
    await expect(cmtPickerRows(page)).toHaveCount(2);
    await cmtPickerBtn(page, "戻る").click();
    await expect(
      cmtPicker(page),
      "hết hàng đợi thì không còn dialog nào",
    ).toHaveCount(0, {
      timeout: 10000,
    });
  });

  test("E-7 /tenant/cmt-autos lỗi → pick vẫn áp VÀ báo lỗi cho người dùng, không nuốt im lặng", async () => {
    await arrange({
      isInitialVisitEligible: true,
      picks: INITIAL_SET,
      reExamPicks: REEXAM_SET,
    });
    cmtUser[`${TRT_CD_SHOSHIN}-0`] = [
      cmt(0, "cmtA"),
      cmt(1, "cmtB"),
      cmt(2, "cmtC"),
    ];
    cmtHttpError = 500;
    await santeiBtn(page, "Yes").click();

    // (a) Bộ pick vẫn phải được áp: WinForm chạy XONG vòng đẩy pick
    // (modSave.cs:3239-3392) rồi mới tới Chk_CmtAuto (:3435-3442), nên hỏng
    // comment KHÔNG được cướp mất dòng 初診/再診.
    const rows = await settledStubRows(INITIAL_SET.length);
    expect(rows).toEqual([`${TAG}初診料`, `${TAG}外安全1初`]);

    // (b) VÀ phải báo cho người dùng biết bước コメント自動入力 đã bị bỏ.
    // Đây chính là chỗ trước đây `.catch(() => [])` nuốt lỗi: một lượt gọi hỏng
    // trông y hệt "処置 này không có CMTAUTO nào" → カルテ記載選択 biến mất không
    // dấu vết. WinForm không có cửa đó — `select count(*) from CMTAUTO`
    // (modMain.cs:781-787) chạy thẳng DB, lỗi thì nổ.
    const errAlert = addonDialog(page).filter({
      hasText: "コメント自動入力の取得に失敗しました",
    });
    await expect(
      errAlert,
      "lỗi /tenant/cmt-autos phải hiện alert — im lặng chính là bug đang truy",
    ).toBeVisible({ timeout: 20000 });
    await expect(
      errAlert,
      "alert phải nêu ĐÍCH DANH 処置 bị mất comment",
    ).toContainText(`${TAG}初診料`);
    await errAlert.getByRole("button", { name: "OK" }).click();
    await expect(errAlert).toHaveCount(0, { timeout: 10000 });

    // (c) Không có dữ liệu thì đương nhiên không có picker — nhưng giờ người dùng
    // đã biết, khác hẳn với việc dialog lặng lẽ không bung.
    await expect(cmtPicker(page)).toHaveCount(0);
  });

  // ══ F. 自動算定２ (処置自動入力 / mst_trt_auto) ════════════════════════════
  //
  // WinForm nối thẳng `ModSave.AutoSantei2` sau `AutoSantei` cho cùng một ngày
  // (frm203002.cs:5345-5353). Trước khi port, lưới web thiếu hẳn 歯科疾患管理料
  // (116/7, 90点) mà WinForm tự算定 — và vì thiếu 処置 đó nên カルテ記載選択 của nó
  // cũng không bao giờ bung.
  //
  // Điều kiện 属性/年齢/時期/必要病名/必要処置/診療チェック nằm trọn ở BE
  // (`GetAutoSantei2Handler` + unit test của nó). Nhóm F chỉ khoá phần FE:
  // gọi đúng lúc, gửi đúng thứ, chèn đúng chỗ, hỏng thì không cướp dòng.

  test("F-1 pick của 自動算定２ được chèn SAU trọn bộ 初再診", async () => {
    await arrange({
      isInitialVisitEligible: true,
      picks: INITIAL_SET,
      reExamPicks: REEXAM_SET,
    });
    auto2 = { picks: [auto2Pick(TRT_CD_SHIKAN, TRT_SB_SHIKAN, "歯管", 90)] };
    await santeiBtn(page, "Yes").click();

    const rows = await settledStubRows(INITIAL_SET.length + 1);
    expect(
      rows,
      "AutoSantei2 chạy SAU AutoSantei (frm203002.cs:5345-5353) nên pick của nó xuống cuối",
    ).toEqual([`${TAG}初診料`, `${TAG}外安全1初`, `${TAG}歯管`]);
  });

  test("F-2 gửi lên patNo/trtDt và các dòng CHƯA lưu vừa được áp", async () => {
    await arrange({
      isInitialVisitEligible: true,
      picks: INITIAL_SET,
      reExamPicks: REEXAM_SET,
    });
    auto2 = { picks: [auto2Pick(TRT_CD_SHIKAN, TRT_SB_SHIKAN, "歯管", 90)] };
    await santeiBtn(page, "Yes").click();
    await settledStubRows(INITIAL_SET.length + 1);

    const body = lastAuto2Body;
    expect(body, "phải có lượt gọi /autosantei2").not.toBeNull();
    expect(body!.patNo).toBe(Number(PAT_NO));
    expect(body!.trtDt).toBe(TRT_DT);

    // WinForm đọc hFG1 nên thấy cả 初再診 vừa AddRow. FE phải tự ghép chúng vào
    // payload: `setCurrentRows` là bất đồng bộ, đọc lại state sẽ thiếu.
    const day = Number(TRT_DT.slice(8, 10));
    const sent = (body!.rows ?? []).map(
      (r) => `${r.trtCd}-${r.trtSb}-${r.day}`,
    );
    for (const p of INITIAL_SET) {
      expect(
        sent,
        `thiếu ${p.trtCd}-${p.trtSb} trong payload → BE mất căn cứ cho 時期/必要処置/チェック`,
      ).toContain(`${p.trtCd}-${p.trtSb}-${day}`);
    }
  });

  test("F-3 pick có 部位 → vẽ 部位病名行 NGAY TRƯỚC dòng 処置", async () => {
    await arrange({
      isInitialVisitEligible: true,
      picks: INITIAL_SET,
      reExamPicks: REEXAM_SET,
    });
    // bui[0] = 1 (răng thứ nhất) + 病名 — DispAutoBuiDraw (modSave.cs:4539-4592)
    // AddRow một dòng 部位病名 rồi mới tới 処置; dòng 処置 kế thừa theo vị trí.
    const bui = Array<number>(32).fill(0);
    bui[0] = 1;
    auto2 = {
      picks: [
        auto2Pick(340, 0, "実地指1", 80, {
          bui,
          disCd: [103],
          dspDis: `${TAG}病名`,
        }),
      ],
    };
    await santeiBtn(page, "Yes").click();

    const rows = await settledStubRows(INITIAL_SET.length + 2);
    expect(rows, "部位病名行 phải nằm TRƯỚC 処置 nó chi phối").toEqual([
      `${TAG}初診料`,
      `${TAG}外安全1初`,
      `${TAG}病名`,
      `${TAG}実地指1`,
    ]);
  });

  test("F-4 /autosantei2 lỗi → bộ 初再診 vẫn nguyên, không dialog", async () => {
    await arrange({
      isInitialVisitEligible: true,
      picks: INITIAL_SET,
      reExamPicks: REEXAM_SET,
    });
    auto2 = { httpError: 500 };
    await santeiBtn(page, "Yes").click();

    // WinForm gọi AutoSantei2 SAU khi AutoSantei đã trả về; nó hỏng thì các dòng
    // 初再診 đã nằm trên lưới vẫn còn nguyên.
    const rows = await settledStubRows(INITIAL_SET.length);
    expect(rows).toEqual([`${TAG}初診料`, `${TAG}外安全1初`]);
    await expect(
      anySanteiQuestion(page),
      "không được hỏi lại gì cả",
    ).toHaveCount(0);
    await expect(cmtPicker(page)).toHaveCount(0);
  });

  test("F-5 không registration nào khớp → không chèn thêm dòng nào", async () => {
    await arrange({
      isInitialVisitEligible: true,
      picks: INITIAL_SET,
      reExamPicks: REEXAM_SET,
    });
    auto2 = { picks: [] };
    await santeiBtn(page, "Yes").click();

    const rows = await settledStubRows(INITIAL_SET.length);
    expect(rows).toEqual([`${TAG}初診料`, `${TAG}外安全1初`]);
  });

  test("F-6 CMTAUTO của pick 自動算定２ cũng mở カルテ記載選択", async () => {
    await arrange({
      isInitialVisitEligible: true,
      picks: INITIAL_SET,
      reExamPicks: REEXAM_SET,
    });
    auto2 = { picks: [auto2Pick(TRT_CD_SHIKAN, TRT_SB_SHIKAN, "歯管", 90)] };
    // Chính là ca thật của tenant: 116/7 có 12 dòng cmt_auto no_chk=0.
    cmtUser[`${TRT_CD_SHIKAN}-${TRT_SB_SHIKAN}`] = [cmt(0, "kA"), cmt(1, "kB")];
    await santeiBtn(page, "Yes").click();

    await expect(
      cmtPicker(page),
      "AutoSantei2 gọi Chk_CmtAuto cho processing của nó (modSave.cs:4069-4076)",
    ).toBeVisible({ timeout: 20000 });
    await expect(
      cmtPicker(page),
      "dialog phải mang tên 処置 của 自動算定２",
    ).toContainText(`${TAG}歯管`);
    await expect(cmtPickerRows(page)).toHaveCount(2);
    // Dialog bung SAU khi 処置 đã nằm trên lưới, giống nhánh 初再診 (E-1).
    expect(await stubRows(page)).toEqual([
      `${TAG}初診料`,
      `${TAG}外安全1初`,
      `${TAG}歯管`,
    ]);
    await cmtPickerBtn(page, "戻る").click();
  });

  // ══ G. 摘要コメントパック trên đường 自動算定 ═══════════════════════════════
  //
  // `Chk_CmtAuto` có HAI nửa (modMain.cs:771-787): prgCmtAuto (摘要コメントパック)
  // rồi mới tới CMTAUTO. Web tách nửa đầu thành hai endpoint — pack_type 50
  // (/programmatic) và pack_type 1/90 (/cascade) — nhưng đường 自動算定 chỉ gọi
  // cái đầu, nên 歯管 mất dòng 「有床義歯に係る口腔管理のみ」 (pack B000-4) mà
  // WinForm vẫn in ra.

  test("G-1 pack 1 ứng viên tự áp cho CẢ pick 初再診 lẫn pick 自動算定２", async () => {
    await arrange({
      isInitialVisitEligible: true,
      picks: INITIAL_SET,
      reExamPicks: REEXAM_SET,
    });
    auto2 = { picks: [auto2Pick(TRT_CD_SHIKAN, TRT_SB_SHIKAN, "歯管", 90)] };
    cascade[`${TRT_CD_SHOSHIN}-0`] = [cascadePack("P-INIT", ["packInit"])];
    cascade[`${TRT_CD_SHIKAN}-${TRT_SB_SHIKAN}`] = [
      cascadePack("B000-4", ["packShikan"], "歯管-有床義歯"),
    ];
    await santeiBtn(page, "Yes").click();

    const rows = await settledStubRows(INITIAL_SET.length + 3);
    // Trình tự WinForm: AutoSantei đẩy hết pick → Chk_CmtAuto từng pick (comment
    // xuống cuối ngày) → rồi mới AutoSantei2 với 処置 + comment của nó.
    expect(rows).toEqual([
      `${TAG}初診料`,
      `${TAG}外安全1初`,
      `${TAG}packInit`,
      `${TAG}歯管`,
      `${TAG}packShikan`,
    ]);
  });

  test("G-2 dò pack cho MỌI pick, kèm patNo và KHÔNG kèm 病名", async () => {
    await arrange({
      isInitialVisitEligible: true,
      picks: INITIAL_SET,
      reExamPicks: REEXAM_SET,
    });
    auto2 = { picks: [auto2Pick(TRT_CD_SHIKAN, TRT_SB_SHIKAN, "歯管", 90)] };
    await santeiBtn(page, "Yes").click();
    await settledStubRows(INITIAL_SET.length + 1);

    const probed = cascadeUrls.map((u) => {
      const q = new URL(u).searchParams;
      return `${q.get("trtCd")}-${q.get("trtSb")}`;
    });
    for (const p of [
      ...INITIAL_SET,
      { trtCd: TRT_CD_SHIKAN, trtSb: TRT_SB_SHIKAN },
    ]) {
      expect(probed, `pick ${p.trtCd}-${p.trtSb} phải được dò pack`).toContain(
        `${p.trtCd}-${p.trtSb}`,
      );
    }

    // patNo là đầu vào của cổng lọc 歯管-有床義歯 ở BE (CmtAuto.cs:189-219):
    // thiếu nó thì cổng không chạy và pack hiện cho cả bệnh nhân còn 現存歯.
    for (const u of cascadeUrls) {
      const q = new URL(u).searchParams;
      expect(
        q.get("patNo"),
        `lượt gọi ${u} thiếu patNo → cổng lọc không chạy được`,
      ).toBe(PAT_NO);
      // Dòng do 自動算定 sinh ra không mang 病名 — WinForm truyền dis_cd của chính
      // dòng đó, và dòng auto-billed thì rỗng.
      expect(
        q.get("disCd"),
        "pick 自動算定 không có 病名 nên không được gửi disCd",
      ).toBeNull();
    }
  });
});
