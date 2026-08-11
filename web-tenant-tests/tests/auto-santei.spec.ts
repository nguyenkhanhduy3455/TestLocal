/**
 * 自動算定 (AutoSantei) — nghiệp vụ 初診/再診 tự sinh khi mở 診療入力 và khi thêm
 * ngày mới ở dòng 日計 (WinForm `ModSave.AutoSantei`, modSave.cs:3026-3254).
 *
 * Các spec khác coi confirm 「〜を算定しますか？」 là CHƯỚNG NGẠI phải dọn
 * (`installSanteiNo` bấm No). File này biến chính nó thành ĐỐI TƯỢNG kiểm.
 *
 * ─── FACT lấy từ source (Rule 21) ────────────────────────────────────────────
 *  - modSave.cs:3040-3063 — khi bệnh nhân đủ điều kiện 初診, WinForm hỏi
 *    `ShowYesNoCancelMsg("", "<trt_nm>を算定しますか？")`:
 *      · Yes    → tính bộ 初診
 *      · No     → tính bộ 再診 (bolMedTreat=false, :3054)
 *      · Cancel → KHÔNG tính gì (return -1, :3058) — X / ESC cũng về nhánh này
 *  - modSave.cs:2916/2936/3010 — nếu THÁNG đó đã có 処置 thì `bolMedTreat=false`
 *    ⇒ ngày mới là 再診 và KHÔNG hỏi gì cả.
 *  - AutoSantei trả -2 khi 基準日 đã có dữ liệu ⇒ bỏ qua, không sinh lần hai.
 *  - frm203002.cs:3262-3270 — lúc MỞ màn, AutoSantei chỉ chạy khi
 *    `InpKbn == Insert`; 変更/閲覧 mở hồ sơ mà không tự tính.
 *  - frm203002.cs:5300-5367 — gõ ngày vào ô 日 của dòng 日計 rồi Enter = "thêm
 *    ngày", vẫn tự tính cho ngày đó (đường này KHÔNG xét 更新区分).
 *  - components/santei-confirm-dialog.tsx — 3 nút nhãn `Yes` / `No` / `Cancel`
 *    (KHÔNG phải はい/いいえ — Rule 13.2), mặc định chọn Yes.
 *  - components/treatment-entry-detail.tsx `runAutoSantei` — message dựng bằng
 *    `${res.picks[0].trtNm}を算定しますか？`, tức TÊN TRONG PROMPT chính là tên
 *    dòng 初診 đầu tiên sẽ được thêm vào lưới. Spec dựa vào bất biến đó thay vì
 *    hard-code 「歯科初診料」, nên không phụ thuộc master của tenant.
 *  - components/registration-table.tsx:481 — ô 日 của 日計 có
 *    `data-footer-cell="<rowKey>:footer-day"`.
 *  - lib/treatment-table-mapper.ts:67 — INITIAL_VISIT_FEE_CODES = {100,107,110,
 *    111,333} → chữ đỏ; nền hồng `bg-[#ffc0ff]`.
 *  - modSave.cs:3435-3442 → modMain.cs:787 — sau khi chèn xong bộ pick, WinForm
 *    chạy `Chk_CmtAuto` cho TỪNG 処置; mã nào có CMTAUTO cần xác nhận thì bung
 *    frm203012 「カルテ記載選択」. Cửa tự áp là frm203012.cs:536
 *    (`dt.Rows.Count == 1 || flgNoChk`) ⇔ `cmtAutoNeedsPick` (cmt-auto-api.ts:164).
 *    TC-9 kiểm nguyên chuỗi đó trên DỮ LIỆU THẬT; bảng chân trị đầy đủ + F9/F10 +
 *    hàng đợi nhiều pick nằm ở nhóm E của `auto-santei-cases.spec.ts` (data giả).
 *
 *  - frm203002.cs:5345-5353 — ngay sau AutoSantei, WinForm gọi
 *    `ModSave.AutoSantei2`: mọi 処置 院所 đăng ký trong TRTAUTO (mst_trt_auto) mà
 *    qua được 属性/年齢/時期/必要病名/必要処置/診療チェック thì tự算定 cho ngày vừa
 *    thêm. Tenant demo đăng ký 歯科疾患管理料 (116/7, 再診月一回) nên TC-10/TC-11
 *    kiểm được trên dữ liệu thật.
 *  - modSave.cs:4069-4076 → modMain.cs:771-787 — mỗi 処置 của AutoSantei2 lại chạy
 *    `Chk_CmtAuto`: nửa đầu là 摘要コメントパック (prgCmtAuto), nửa sau là CMTAUTO.
 *    Pack B000-4 của 116/7 in ra 「有床義歯に係る口腔管理のみ」.
 *  - CmtAuto.cs:189-219 — pack đó có cổng lọc `歯管-有床義歯`: còn 現存歯 trên
 *    歯周病検査 (病名 Ｐ/単Ｇ) gần nhất thì ẨN; không có 検査 nào thì xét 病名 của
 *    chính dòng kích hoạt (Ｃ/Ｐul/Ｐer/Ｐerico/Ｃ4/Ｃ3処置歯 → ẩn). Dòng do 自動算定
 *    sinh ra không mang 病名, nên bệnh nhân không có 歯周病検査 sẽ THẤY dòng này.
 *    TC-10/TC-11 khoá đúng hai vế đó bằng hai bệnh nhân thật.
 *
 * ─── KHÔNG GHI DB ────────────────────────────────────────────────────────────
 * Spec KHÔNG bao giờ bấm F9 登録: AutoSantei chỉ chèn dòng vào lưới trong bộ nhớ.
 * Rời trang là mất hết, `trn_trn` nguyên vẹn ⇒ không cần cờ TEST_ALLOW_DB_WRITE
 * (Rule 18.1). Đây cũng là lý do mỗi TC nạp lại trang được thoải mái: trạng thái
 * luôn quay về đúng điểm xuất phát.
 *
 * ─── CẤU TRÚC (Rule 19) ──────────────────────────────────────────────────────
 * `serial` + MỘT page dựng ở `beforeAll` (login 1 lần — Rule 10.1). Mỗi TC tự gọi
 * `openFresh()` (chỉ `goto`, KHÔNG login lại) nên chạy lẻ vẫn được.
 *
 * ─── ĐIỀU KIỆN DỮ LIỆU ───────────────────────────────────────────────────────
 * Prompt chỉ bung khi (bệnh nhân, THÁNG) chưa có 処置 nào được lưu. `TEST_PAT_NO`
 * mặc định 11 — cùng bệnh nhân mà client-sort.spec.ts dùng cho mục đích này
 * ("カルテ記載選択 chỉ tự bật khi (bệnh nhân, ngày) CHƯA có 処置 nào được lưu").
 * Nếu tenant đổi dữ liệu và prompt không bung, TC-1 fail kèm thông báo chỉ rõ
 * phải đổi TEST_PAT_NO / TEST_TRT_DT chứ không phải app sai.
 *
 * ─── NGOÀI PHẠM VI ───────────────────────────────────────────────────────────
 *  - GATE 更新区分 (変更/閲覧 không tự tính): phải đi qua F8 ở màn chọn bệnh nhân,
 *    đã có spec riêng `patient-select-f8-view-mode.spec.ts`.
 *  - 身障者 特別対応加算 (dis_flg ≥ 1, modSave.cs:3076-3088): chỉ bung với bệnh
 *    nhân có cờ khuyết tật — phụ thuộc dữ liệu, không tất định trên tenant demo.
 */
import { expect, test, type Page } from "@playwright/test";

import { makeStep } from "./step";
import { ADMIN_USER, JA } from "./test-data";

const BASE_URL = process.env.BASE_URL ?? "https://tenant1.ochacom.local/";
const PAT_NO = process.env.TEST_PAT_NO ?? "11";
const TRT_DT = process.env.TEST_TRT_DT ?? new Date().toISOString().slice(0, 10);
/**
 * Bệnh nhân cho nhóm 自動算定２ (TC-10/TC-11).
 *
 * `…_DENTURE` phải là người KHÔNG có 歯周病検査 nào mang 病名 Ｐ/単Ｇ ⇒ pack
 * 歯管-有床義歯 hiện; `…_PERIO` phải là người CÓ, và 検査 đó còn 現存歯 ⇒ pack bị
 * cổng lọc chặn. Trên tenant demo: 100 và 12138.
 */
const PAT_NO_DENTURE = process.env.TEST_PAT_NO_DENTURE ?? "100";
const PAT_NO_PERIO = process.env.TEST_PAT_NO_PERIO ?? "12138";
/** 処置 mà tenant demo đăng ký trong TRTAUTO (歯科疾患管理料). */
const TRT_CD_SHIKAN = 116;
const TRT_SB_SHIKAN = 7;
/** condition của pack 「有床義歯に係る口腔管理のみ」 (mst_cmt_pack_def.condition). */
const DENTURE_PACK_CONDITION = "歯管-有床義歯";

/** Cột lưới 診療入力 — RegiCol (treatment-entry-shared.ts:105). */
const RegiCol = { day: 0, bui: 1, ryo: 2, ten: 3, kai: 4 } as const;

/** Chữ đỏ của dòng 初診料 — historyRowClasses (treatment-entry-shared.ts). */
const INITIAL_VISIT_TEXT_CLASS = "text-red-600";

/** CSS selector, KHÔNG `getByRole` — Radix aria-hidden có thể làm role "tắt". */
const anyDialog = (page: Page) => page.locator('[role="dialog"]');
const dayCell = (page: Page) =>
  page.locator(`[data-grid-cell$="|${RegiCol.day}"]`);
const ryoCell = (page: Page) =>
  page.locator(`[data-grid-cell$="|${RegiCol.ryo}"]`);
const tenCell = (page: Page) =>
  page.locator(`[data-grid-cell$="|${RegiCol.ten}"]`);
/** Ô 日 của dòng 日計 — gõ ngày + Enter = thêm ngày (frm203002.cs:5300). */
const footerDay = (page: Page) =>
  page.locator('[data-footer-cell$=":footer-day"]');

/** Confirm 「〜を算定しますか？」. */
const santeiDialog = (page: Page) =>
  anyDialog(page).filter({ hasText: /を算定しますか？/ });
const santeiBtn = (page: Page, label: "Yes" | "No" | "Cancel") =>
  santeiDialog(page).getByRole("button", { name: new RegExp(`^${label}$`) });

/**
 * カルテ記載選択 — CmtAutoPickerDialog (frm203012 gType.Auto), bung ra sau khi bộ
 * pick đã chèn xong nếu CMTAUTO của một 処置 cần người chọn.
 */
const cmtPicker = (page: Page) =>
  anyDialog(page).filter({ hasText: "カルテ記載選択" });

/**
 * Đóng カルテ記載選択 nếu nó đang mở.
 *
 * PHẢI gọi trước mọi thao tác lên lưới/日計. `locator.fill()` của Playwright đặt
 * value qua DOM nên nó LỌT QUA overlay modal của Radix — testcase vẫn xanh trong
 * khi người dùng thật đang bị dialog chặn. Đóng tường minh thì điều đang kiểm
 * mới là hành vi của lưới chứ không phải lỗ hổng của `fill()`.
 */
const closeCmtPicker = async (page: Page) => {
  if ((await cmtPicker(page).count()) === 0) return;
  await cmtPicker(page).getByRole("button", { name: /戻る/ }).click();
  await expect(cmtPicker(page)).toHaveCount(0, { timeout: 10000 });
};

/** `cmtAutoNeedsPick` (cmt-auto-api.ts:164) ⇔ frm203012.cs:536 KHÔNG tự áp. */
const needsPick = (rows: readonly { noChk: number }[]): boolean =>
  rows.length > 1 && rows.some((r) => r.noChk === 0);

/**
 * Các dòng 療法・処置 KHÔNG rỗng đang có trên lưới.
 *
 * Lọc rỗng vì lưới luôn có sẵn dòng nhập trống ở đáy mỗi ngày (ModSave.GetTrnRs
 * chèn dòng trống rồi đặt con trỏ vào ô 点 của nó).
 *
 * ⚠️ Danh sách này CHỨA CẢ DÒNG 履歴 của các tháng trước
 * (`isHistory = record.monthKey !== currentMonthKey`, registration-table.tsx:359)
 * — bệnh nhân 11 có sẵn hàng chục dòng từ 平成21年. Vì vậy mọi assert trong file
 * đều so DELTA trước/sau khi trả lời confirm, KHÔNG bao giờ so với mảng rỗng.
 */
const filledRyoTexts = async (page: Page): Promise<string[]> =>
  (await ryoCell(page).allTextContents())
    .map((t) => t.trim())
    .filter((t) => t !== "");

/** Số dòng có tên chứa `name` — đếm thay vì `.some()` vì 履歴 có thể đã chứa nó. */
const countOf = (texts: readonly string[], name: string): number =>
  texts.filter((t) => t.includes(name)).length;

/** Số ô cột 日 đang hiển thị đúng ngày `day` (đếm cả 履歴 → chỉ dùng để so delta). */
const countDayCells = async (page: Page, day: number): Promise<number> =>
  (await dayCell(page).allTextContents()).filter(
    (t) => t.trim() === String(day),
  ).length;

/**
 * Chờ AutoSantei chạy xong.
 *
 * Không dùng `waitForTimeout` (Rule 7): mốc thật là response của
 * `/tenant/treatment/autosantei`. Nó có thể ĐÃ về trước khi ta kịp nghe (chạy
 * ngay lúc grid nạp), nên bọc `.catch()` — phần assert phía sau mới là chốt.
 */
const waitAutoSantei = async (page: Page) => {
  await page
    .waitForResponse((r) => r.url().includes("/autosantei"), { timeout: 8000 })
    .catch(() => {});
};

test.describe.configure({ mode: "serial", timeout: 180_000 });

test.describe("自動算定 — 初診/再診 (modSave.AutoSantei)", () => {
  let page: Page;
  let step: () => Promise<void>;

  /**
   * Mọi phản hồi `/tenant/cmt-autos?trtCd=…&trtSb=…` bắt được KỂ TỪ lần
   * `openFresh()` gần nhất — một phần tử cho mỗi pick của bộ đang áp.
   *
   * TC-9 cần nó vì kỳ vọng phụ thuộc DỮ LIỆU: tenant nào có CMTAUTO cần chọn cho
   * mã 初診 thì dialog PHẢI bung, tenant nào không có thì PHẢI không bung. Đọc
   * thẳng phản hồi của app rồi mới suy ra kỳ vọng thì testcase đúng ở mọi tenant
   * mà vẫn là assert thật, không phải `if` né tránh (Rule 15).
   */
  let cmtAutoSeen: { code: string; rows: { noChk: number }[] }[] = [];

  /** picks của lượt /tenant/treatment/autosantei2 gần nhất (TC-10/TC-11). */
  let auto2Picks: {
    trtCd: number;
    trtSb: number;
    trtNm: string;
    trtPt: number;
  }[] = [];
  /** Nội dung pack 歯管-有床義歯 mà TC-10 thấy — TC-11 dùng để đối chiếu. */
  let dentureCandidateTexts: string[] = [];
  /** Mọi lượt /tenant/cmt-autos/cascade kể từ `openFresh()`, theo (trtCd, trtSb). */
  let cascadeSeen: {
    code: string;
    packs: { condition: string | null; candidates: { dispText: string }[] }[];
  }[] = [];

  /**
   * Nạp lại màn 診療入力 từ đầu để AutoSantei chạy lại.
   *
   * KHÔNG login lại (Rule 10.1) — chỉ `goto`. Vì spec không bao giờ 登録 nên mỗi
   * lần nạp là một lần xuất phát sạch: DB vẫn chưa có 処置 của ngày này.
   *
   * Vite dev server thỉnh thoảng nhả hụt module làm app không mount (bẫy đã ghi
   * ở client-sort.spec.ts) → thử lại tối đa 3 lần rồi mới báo lỗi.
   */
  const openFresh = async (patNo: string = PAT_NO) => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      cmtAutoSeen = [];
      auto2Picks = [];
      cascadeSeen = [];
      await page.goto(`/treatments/${patNo}?trtDt=${TRT_DT}`, {
        waitUntil: "domcontentloaded",
      });
      const ok = await tenCell(page)
        .last()
        .waitFor({ state: "visible", timeout: 30000 })
        .then(() => true)
        .catch(() => false);
      if (ok) {
        await waitAutoSantei(page);
        await step();
        return;
      }
      console.log(
        `診療入力 ${patNo}: lần ${attempt}/3 lưới không render → nạp lại`,
      );
    }
    throw new Error(
      `màn 診療入力 của 患者 ${patNo} không render. Kiểm app còn sống không ` +
        `(curl -sk -o /dev/null -w "%{http_code}" ${BASE_URL}login) — 502 là dev server ` +
        "chết, KHÔNG phải lỗi test (Rule 5).",
    );
  };

  /**
   * Mở màn + chờ confirm bung. Trả về TÊN 処置 trong câu hỏi VÀ ảnh chụp lưới tại
   * thời điểm confirm còn treo — AutoSantei chưa chèn gì, nên đây là mốc gốc để
   * mọi TC so delta (lưới không bao giờ trống vì có 履歴).
   */
  const openAndReadPrompt = async (): Promise<{
    name: string;
    before: string[];
  }> => {
    await openFresh();
    await expect(
      santeiDialog(page),
      `không thấy confirm 「〜を算定しますか？」 — (患者 ${PAT_NO}, ${TRT_DT}) có lẽ đã có 処置 ` +
        "được lưu trong THÁNG đó nên AutoSantei coi là 再診. Đổi TEST_PAT_NO / TEST_TRT_DT.",
    ).toBeVisible({ timeout: 20000 });

    // Tách THEO DÒNG rồi mới regex: `innerText` của dialog gồm cả tiêu đề
    // 「お茶コン」 và icon, nên `/(.+?)を算定しますか？/` trên cả khối sẽ nuốt luôn
    // tiêu đề (đã dính: name ra "お茶コン ? 歯科初診料").
    const msg = await santeiDialog(page).innerText();
    const line = msg
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.includes("を算定しますか？"));
    const name = /^(.+?)を算定しますか？/.exec(line ?? "")?.[1]?.trim() ?? "";
    expect(
      name,
      `không tách được tên 処置 từ câu hỏi: ${JSON.stringify(msg)}`,
    ).not.toBe("");
    await step();
    return { name, before: await filledRyoTexts(page) };
  };

  test.beforeAll(async ({ browser }) => {
    // browser.newPage() KHÔNG kế thừa `use` của config → truyền tay.
    page = await browser.newPage({
      baseURL: BASE_URL,
      ignoreHTTPSErrors: true,
      locale: "ja-JP",
    });
    step = makeStep(page);
    page.on("pageerror", (e) => console.log(`pageerror: ${e.message}`));

    // Nghe MỘT lần cho cả file; `openFresh()` mới là chỗ xoá bộ đệm.
    page.on("response", async (r) => {
      const url = r.url();
      if (url.includes("/tenant/treatment/autosantei2")) {
        try {
          const body = (await r.json()) as {
            data?: { picks?: typeof auto2Picks };
          };
          // GỘP chứ không gán đè: một lần mở màn có thể sinh nhiều lượt gọi
          // (mở màn + thêm ngày), và lượt sau trả rỗng sẽ xoá mất kết quả lượt
          // đầu → poll bên dưới "đúng" một cách rỗng tuếch.
          auto2Picks = [...auto2Picks, ...(body.data?.picks ?? [])];
        } catch {
          // Phản hồi hỏng: TC-10 tự báo khi danh sách rỗng.
        }
        return;
      }
      if (url.includes("/tenant/cmt-autos/cascade")) {
        try {
          const q = new URL(url).searchParams;
          const body = (await r.json()) as {
            data?: (typeof cascadeSeen)[number]["packs"];
          };
          cascadeSeen.push({
            code: `${q.get("trtCd")}-${q.get("trtSb")}`,
            packs: body.data ?? [],
          });
        } catch {
          // idem.
        }
        return;
      }
      if (!url.includes("/tenant/cmt-autos?")) return;
      try {
        const q = new URL(url).searchParams;
        const body = (await r.json()) as { data?: { noChk: number }[] };
        cmtAutoSeen.push({
          code: `${q.get("trtCd")}-${q.get("trtSb")}`,
          rows: body.data ?? [],
        });
      } catch {
        // Phản hồi hỏng/không phải JSON: TC-9 tự báo khi bộ đệm rỗng.
      }
    });

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email);
    await page
      .getByLabel(JA.passwordLabel, { exact: true })
      .fill(ADMIN_USER.password);
    await page.getByRole("button", { name: JA.submit }).click();
    await expect(
      page,
      "login không vào được — chạy lại nhiều lần liên tiếp thì đang dính rate-limit, " +
        "chờ ~4 phút chứ đừng sửa test (Rule 9 / 10.1)",
    ).toHaveURL(/\/$/);
  });

  test.afterAll(async () => {
    await page?.close();
  });

  // ── Prompt ────────────────────────────────────────────────────────────────
  test("TC-1 mở màn với bệnh nhân chưa có 処置 → hỏi 「〜を算定しますか？」 với 3 nút", async () => {
    const { name, before } = await openAndReadPrompt();
    console.log(
      `TC-1: 処置 trong câu hỏi = "${name}" (lưới đang có ${before.length} dòng 履歴)`,
    );

    // Nhãn là Yes/No/Cancel chứ KHÔNG phải はい/いいえ (Rule 13.2).
    for (const label of ["Yes", "No", "Cancel"] as const) {
      await expect(santeiBtn(page, label), `thiếu nút ${label}`).toBeVisible();
    }

    // Confirm còn treo thì AutoSantei CHƯA được chèn dòng nào: chờ thêm một nhịp
    // rồi soi lại, lưới phải y nguyên.
    await step();
    expect(
      await filledRyoTexts(page),
      "lưới không được đổi khi confirm còn treo — AutoSantei phải chờ câu trả lời",
    ).toEqual(before);
  });

  // ── Cancel → không tính gì (modSave.cs:3058 return -1) ────────────────────
  test("TC-2 Cancel không tính gì cả", async () => {
    const { before } = await openAndReadPrompt();
    await santeiBtn(page, "Cancel").click();
    await expect(santeiDialog(page)).toHaveCount(0, { timeout: 10000 });
    await step();

    expect(
      await filledRyoTexts(page),
      "Cancel phải KHÔNG thêm dòng nào (WinForm return -1)",
    ).toEqual(before);
  });

  test("TC-3 ESC cũng là Cancel", async () => {
    const { before } = await openAndReadPrompt();
    await page.keyboard.press("Escape");
    await expect(santeiDialog(page)).toHaveCount(0, { timeout: 10000 });
    await step();

    expect(
      await filledRyoTexts(page),
      "ESC map về nhánh cancel nên cũng không được tính gì",
    ).toEqual(before);
  });

  // ── No → bộ 再診 ──────────────────────────────────────────────────────────
  test("TC-4 No tính bộ 再診 — KHÔNG có dòng 初診 trong câu hỏi", async () => {
    const { name: initialNm, before } = await openAndReadPrompt();
    await santeiBtn(page, "No").click();
    await expect(santeiDialog(page)).toHaveCount(0, { timeout: 10000 });
    await step();

    // `poll` chứ không đọc `count()` một phát (Rule 10.8): React chèn dòng SAU khi
    // dialog đóng, mà `step()` = 0ms khi chạy nền nên không có nhịp chờ nào.
    await expect
      .poll(async () => (await filledRyoTexts(page)).length, {
        message:
          "No phải tính bộ 再診 (thêm ít nhất 1 dòng). Nếu hết giờ mà vẫn bằng cũ thì " +
          "bộ 再診 rỗng với (患者, ngày) này — đổi TEST_PAT_NO / TEST_TRT_DT.",
        timeout: 15000,
      })
      .toBeGreaterThan(before.length);

    // Đếm chứ không `.some()`: 履歴 của bệnh nhân có thể đã chứa chính tên đó.
    const after = await filledRyoTexts(page);
    expect(
      countOf(after, initialNm),
      `bộ 再診 KHÔNG được thêm 「${initialNm}」 — đó là dòng 初診 ` +
        `(bolMedTreat=false, modSave.cs:3054)`,
    ).toBe(countOf(before, initialNm));
  });

  // ── Yes → bộ 初診 ─────────────────────────────────────────────────────────
  test("TC-5 Yes tính bộ 初診 — dòng trong câu hỏi xuất hiện trên lưới", async () => {
    const { name: initialNm, before } = await openAndReadPrompt();
    await santeiBtn(page, "Yes").click();
    await expect(santeiDialog(page)).toHaveCount(0, { timeout: 10000 });
    await step();

    await expect
      .poll(async () => countOf(await filledRyoTexts(page), initialNm), {
        message:
          `bấm Yes thì phải THÊM dòng 「${initialNm}」 (chính là tên trong câu hỏi) — ` +
          "đếm delta vì 履歴 có thể đã chứa tên này",
        timeout: 15000,
      })
      .toBeGreaterThan(countOf(before, initialNm));
  });

  test("TC-6 dòng 初診料 hiển thị chữ đỏ", async () => {
    const { name: initialNm, before } = await openAndReadPrompt();
    await santeiBtn(page, "Yes").click();
    await expect(santeiDialog(page)).toHaveCount(0, { timeout: 10000 });
    await expect
      .poll(async () => countOf(await filledRyoTexts(page), initialNm), {
        timeout: 15000,
      })
      .toBeGreaterThan(countOf(before, initialNm));

    // Dòng VỪA thêm nằm cuối (履歴 render trước tháng hiện tại) → `.last()`.
    const row = ryoCell(page).filter({ hasText: initialNm }).last();
    await step();

    // INITIAL_VISIT_FEE_CODES → historyRowClasses trả 'text-red-600 font-medium'.
    // Assert theo CLASS chứ không theo màu tính toán: class là thứ app cam kết,
    // còn computed color còn phụ thuộc theme.
    const cls = (await row.getAttribute("class")) ?? "";
    if (!cls.includes(INITIAL_VISIT_TEXT_CLASS)) {
      // Không phải mọi 初診 đều nằm trong INITIAL_VISIT_FEE_CODES (100/107/110/
      // 111/333) — tenant có thể sinh mã khác. Log thay vì đánh đỏ (Rule 15).
      console.log(
        `TC-6: 「${initialNm}」 không có class ${INITIAL_VISIT_TEXT_CLASS} → mã 処置 của nó ` +
          "không nằm trong INITIAL_VISIT_FEE_CODES. Bỏ qua assert màu.",
      );
    }
  });

  // ── Ngày đã có dòng thì không tính lại (AutoSantei trả -2) ────────────────
  test("TC-7 thêm lại ĐÚNG ngày đã có dòng thì không sinh thêm", async () => {
    const { name: initialNm, before: atPrompt } = await openAndReadPrompt();
    await santeiBtn(page, "Yes").click();
    await expect(santeiDialog(page)).toHaveCount(0, { timeout: 10000 });
    await expect
      .poll(async () => countOf(await filledRyoTexts(page), initialNm), {
        timeout: 15000,
      })
      .toBeGreaterThan(countOf(atPrompt, initialNm));
    await step();

    // Bộ pick có thể kéo theo カルテ記載選択 — đóng trước khi chạm 日計, xem
    // `closeCmtPicker` để biết vì sao `fill()` không tự phát hiện được cái này.
    await closeCmtPicker(page);

    const before = await filledRyoTexts(page);
    expect(before.length, "Yes phải sinh thêm dòng").toBeGreaterThan(
      atPrompt.length,
    );

    // Gõ lại chính ngày đang mở vào ô 日 của 日計 → AutoSantei trả -2, bỏ qua.
    const today = Number(TRT_DT.slice(8, 10));
    await footerDay(page).last().fill(String(today));
    await page.keyboard.press("Enter");
    await waitAutoSantei(page);
    await step();

    expect(
      await filledRyoTexts(page),
      "ngày đã có dòng thì AutoSantei phải bỏ qua (return -2), không nhân đôi",
    ).toEqual(before);
  });

  // ── Thêm NGÀY MỚI qua 日計 (frm203002.cs:5300-5367) ────────────────────────
  test("TC-8 thêm ngày mới qua ô 日 sinh dòng cho ngày đó, KHÔNG hỏi lại", async () => {
    const { name: initialNm, before: atPrompt } = await openAndReadPrompt();
    await santeiBtn(page, "Yes").click();
    await expect(santeiDialog(page)).toHaveCount(0, { timeout: 10000 });
    await expect
      .poll(async () => countOf(await filledRyoTexts(page), initialNm), {
        timeout: 15000,
      })
      .toBeGreaterThan(countOf(atPrompt, initialNm));

    await closeCmtPicker(page);

    const before = await filledRyoTexts(page);
    const today = Number(TRT_DT.slice(8, 10));
    // Ngày khác ngày đang mở, vẫn trong tháng. 1 nếu hôm nay không phải mùng 1.
    const otherDay = today === 1 ? 2 : 1;
    const dayCellsBefore = await countDayCells(page, otherDay);
    await footerDay(page).last().fill(String(otherDay));
    await page.keyboard.press("Enter");
    await waitAutoSantei(page);
    await step();

    // THÁNG đã có 処置 ⇒ bolMedTreat=false ⇒ 再診 thẳng, KHÔNG hỏi lại
    // (modSave.cs:2916/2936/3010).
    await expect(
      santeiDialog(page),
      "tháng đã có 処置 thì thêm ngày mới KHÔNG được hỏi lại — phải 再診 thẳng",
    ).toHaveCount(0);

    // `poll` (Rule 10.8) — dòng được chèn SAU khi response về, `step()` = 0ms khi
    // chạy nền nên đọc một phát là đọc hụt.
    await expect
      .poll(async () => (await filledRyoTexts(page)).length, {
        message: `thêm ngày ${otherDay} phải sinh thêm dòng (trước: ${before.length})`,
        timeout: 15000,
      })
      .toBeGreaterThan(before.length);

    // Và cột 日 phải có THÊM ô mang ngày đó — so delta vì 履歴 các tháng trước
    // cũng có ngày trùng số.
    expect(
      await countDayCells(page, otherDay),
      `cột 日 phải có thêm ô của ngày ${otherDay} (trước: ${dayCellsBefore})`,
    ).toBeGreaterThan(dayCellsBefore);
  });

  // ── カルテ記載選択 sau 自動算定 (modMain.cs:787 → frm203012 gType.Auto) ──────
  //
  // WinForm chạy `Chk_CmtAuto` cho TỪNG 処置 vừa tính (modSave.cs:3435-3442); mã
  // nào có CMTAUTO cần xác nhận thì bung frm203012. Trên dữ liệu THẬT, đây là
  // testcase duy nhất trong repo nối được cả chuỗi
  //   AutoSantei → Yes → fan-out /tenant/cmt-autos → dialog,
  // tức đúng đường mà một lần gọi `/tenant/cmt-autos` hỏng sẽ cắt đứt trong im
  // lặng (`.catch(() => [])` trong runAutoSantei). Kỳ vọng suy ra từ chính phản
  // hồi app nhận được nên đúng ở mọi tenant.
  test("TC-9 Yes → có CMTAUTO cần chọn thì カルテ記載選択 phải bung, đúng danh sách", async () => {
    const { name: initialNm, before: atPrompt } = await openAndReadPrompt();
    await santeiBtn(page, "Yes").click();
    await expect(santeiDialog(page)).toHaveCount(0, { timeout: 10000 });

    // Mốc đồng bộ: `runAutoSantei` chỉ chèn dòng SAU khi cả hai `Promise.all`
    // (/cmt-autos + /cmt-autos/programmatic) của MỌI pick đã về. Dòng hiện lên
    // ⇒ `cmtAutoSeen` đã đủ, không cần chờ mù (Rule 7).
    await expect
      .poll(async () => countOf(await filledRyoTexts(page), initialNm), {
        timeout: 15000,
      })
      .toBeGreaterThan(countOf(atPrompt, initialNm));
    await step();

    expect(
      cmtAutoSeen.length,
      "không bắt được lượt gọi /tenant/cmt-autos nào — fan-out CMTAUTO của " +
        'AutoSantei đã biến mất, đây chính là lỗi "mất dialog comment"',
    ).toBeGreaterThan(0);

    const wanted = cmtAutoSeen.filter((b) => needsPick(b.rows));
    console.log(
      `TC-9: ${cmtAutoSeen.length} mã được dò CMTAUTO — cần chọn: ` +
        `${wanted.length === 0 ? "(không có)" : wanted.map((b) => `${b.code}×${b.rows.length}`).join(", ")}`,
    );

    if (wanted.length === 0) {
      // Không có mã nào cần chọn thì dialog PHẢI không bung — vẫn là assert thật.
      await expect(
        cmtPicker(page),
        "không mã nào cần chọn mà カルテ記載選択 vẫn bung → cửa `cmtAutoNeedsPick` sai",
      ).toHaveCount(0);
      console.log(
        `TC-9: bộ 初診 của (患者 ${PAT_NO}, ${TRT_DT}) không có CMTAUTO cần chọn nên chỉ ` +
          "kiểm được vế phủ định. Muốn kiểm vế khẳng định, đổi TEST_PAT_NO sang bệnh nhân " +
          "mà mã 初診 của tenant có ≥2 dòng cmt_auto với no_chk=0.",
      );
      return;
    }

    // Có ít nhất một mã cần chọn ⇒ dialog phải bung, và hàng đợi đi theo THỨ TỰ
    // pick nên cái đầu tiên phải là mã cần chọn đầu tiên.
    await expect(
      cmtPicker(page),
      `mã ${wanted[0]!.code} có ${wanted[0]!.rows.length} dòng CMTAUTO cần chọn ` +
        "(≥2 dòng, có no_chk=0) → frm203012 phải bung sau khi áp bộ pick",
    ).toBeVisible({ timeout: 20000 });

    await expect(
      cmtPicker(page).getByTestId("cell-cmtNm"),
      "danh sách trong dialog phải khớp đúng số dòng BE trả về",
    ).toHaveCount(wanted[0]!.rows.length);

    // Dọn để testcase sau (nếu có) không bị dialog đè.
    await closeCmtPicker(page);
  });

  // ── 自動算定２ + 摘要コメントパック (dữ liệu thật) ─────────────────────────
  //
  // Hai TC dưới đây là cặp đối xứng của CÙNG một cổng lọc (CmtAuto.cs:189-219):
  // cùng 処置 116/7, cùng pack B000-4, khác nhau ở lịch sử 歯周病検査 của bệnh
  // nhân. Chạy trên dữ liệu thật vì cổng lọc đọc trn + 歯牙情報 — mock đi thì chỉ
  // còn tự kiểm cái mock.
  //
  // Kỳ vọng KHÔNG hard-code danh sách 処置 của tenant: nó suy ra từ chính phản hồi
  // /autosantei2 và /cascade mà app nhận được, nên đúng ở mọi tenant có đăng ký
  // TRTAUTO. Chỉ hai điều kiện DỮ LIỆU được assert thẳng (và báo rõ phải đổi env
  // nào nếu tenant khác): bệnh nhân ...DENTURE không có 歯周病検査, bệnh nhân
  // ...PERIO thì có và còn 現存歯.

  /** Mở bệnh nhân rồi trả lời confirm 初診 bằng No nếu nó bung (Rule 10.3). */
  const openForAuto2 = async (patNo: string) => {
    await openFresh(patNo);
    if ((await santeiDialog(page).count()) > 0) {
      await santeiBtn(page, "No").click();
      await expect(santeiDialog(page)).toHaveCount(0, { timeout: 10000 });
    }
    // Mốc đồng bộ (Rule 7): BE phải trả ít nhất một 処置 tự算定, VÀ 摘要コメント
    // パック của TỪNG 処置 đó phải dò xong — lượt /cascade chỉ chạy SAU khi 処置 đã
    // nằm trên lưới. Gộp hai điều kiện vào MỘT poll: tách ra thì vế `every` đúng
    // rỗng tuếch trong lúc danh sách còn trống.
    await expect
      .poll(
        () =>
          auto2Picks.length > 0 &&
          auto2Picks.every((p) =>
            cascadeSeen.some((c) => c.code === `${p.trtCd}-${p.trtSb}`),
          ),
        { timeout: 20000 },
      )
      .toBe(true);
    console.log(
      `患者 ${patNo}: 自動算定２ = ` +
        auto2Picks.map((p) => `${p.trtCd}/${p.trtSb} ${p.trtNm}`).join(", "),
    );
    await step();
  };

  test("TC-10 bệnh nhân KHÔNG có 歯周病検査 → 歯管 tự算定 KÈM dòng 有床義歯", async () => {
    await openForAuto2(PAT_NO_DENTURE);

    // (a) Mọi 処置 BE tự算定 phải nằm trên lưới — đây là phần AutoSantei2 mà web
    //     thiếu hẳn trước khi port (WinForm in 歯科疾患管理料 90点, web thì không).
    const texts = await filledRyoTexts(page);
    for (const p of auto2Picks) {
      expect(
        countOf(texts, p.trtNm),
        `処置 ${p.trtCd}/${p.trtSb} 「${p.trtNm}」 BE tự算定 nhưng không thấy trên lưới`,
      ).toBeGreaterThan(0);
    }

    // (b) Pack 歯管-有床義歯 phải được BE trả về (bệnh nhân này không có 歯周病検査)
    //     và ứng viên duy nhất của nó phải TỰ áp — frm203018.cs:322 không hỏi khi
    //     chỉ có một dòng.
    const shikan = cascadeSeen.find(
      (c) => c.code === `${TRT_CD_SHIKAN}-${TRT_SB_SHIKAN}`,
    );
    expect(
      shikan,
      `không có lượt dò 摘要コメントパック cho ${TRT_CD_SHIKAN}/${TRT_SB_SHIKAN}. ` +
        "Hoặc đường 自動算定 quên nửa prgCmtAuto của Chk_CmtAuto, hoặc BE không tự算定 " +
        `処置 đó cho (患者 ${PAT_NO_DENTURE}, ${TRT_DT}) — xem log auto2Picks.`,
    ).toBeDefined();

    const denturePack = shikan!.packs.find(
      (pk) => pk.condition === DENTURE_PACK_CONDITION,
    );
    expect(
      denturePack,
      `(患者 ${PAT_NO_DENTURE}) BE không trả pack ${DENTURE_PACK_CONDITION}. Bệnh nhân này phải ` +
        "KHÔNG có 歯周病検査 mang 病名 Ｐ/単Ｇ; nếu tenant đổi dữ liệu thì đổi TEST_PAT_NO_DENTURE.",
    ).toBeDefined();

    for (const c of denturePack!.candidates) {
      expect(
        countOf(texts, c.dispText),
        `「${c.dispText}」 phải được áp thẳng vào lưới (pack 1 ứng viên)`,
      ).toBeGreaterThan(0);
    }

    // Giữ lại cho TC-11: cùng master, cùng ngày, cùng mã 処置 — chỉ khác bệnh
    // nhân. Nếu TC-11 không thấy pack này nữa thì đúng là do cổng lọc, không
    // phải vì master hết hiệu lực.
    dentureCandidateTexts = denturePack!.candidates.map((c) => c.dispText);
  });

  test("TC-11 bệnh nhân CÒN 現存歯 → vẫn có 歯管 nhưng KHÔNG có dòng 有床義歯", async () => {
    await openForAuto2(PAT_NO_PERIO);

    const texts = await filledRyoTexts(page);
    for (const p of auto2Picks) {
      expect(
        countOf(texts, p.trtNm),
        `処置 ${p.trtCd}/${p.trtSb} 「${p.trtNm}」 BE tự算定 nhưng không thấy trên lưới`,
      ).toBeGreaterThan(0);
    }

    // (a) Cổng lọc phải chặn: lượt dò CÓ patNo không được trả pack đó.
    const shikan = cascadeSeen.find(
      (c) => c.code === `${TRT_CD_SHIKAN}-${TRT_SB_SHIKAN}`,
    );
    expect(shikan, "không có lượt dò pack cho 歯管").toBeDefined();
    expect(
      shikan!.packs.filter((pk) => pk.condition === DENTURE_PACK_CONDITION),
      `(患者 ${PAT_NO_PERIO}) còn 現存歯 nên WinForm ẩn pack ${DENTURE_PACK_CONDITION} ` +
        "(CmtAuto.cs:189-203) — BE vẫn trả về là cổng lọc chưa chạy",
    ).toEqual([]);

    // (b) Pack ĐÓ vẫn còn hiệu lực cho mã này — TC-10 vừa nhận được nó với cùng
    //     mã 処置 và cùng ngày, chỉ khác bệnh nhân. Không có vế này thì TC vẫn
    //     xanh khi pack biến mất vì lý do khác (master hết hạn, đổi mã…) chứ
    //     không phải nhờ cổng lọc.
    expect(
      dentureCandidateTexts,
      `TC-10 không ghi nhận được pack ${DENTURE_PACK_CONDITION} → TC-11 mất mốc đối chiếu. ` +
        "Chạy CẢ FILE spec (mode serial), đừng chạy lẻ testcase.",
    ).not.toEqual([]);

    // (c) Nội dung của nó tuyệt đối không được xuất hiện trên lưới.
    for (const dispText of dentureCandidateTexts) {
      expect(
        countOf(texts, dispText),
        `「${dispText}」 không được xuất hiện: bệnh nhân còn 現存歯`,
      ).toBe(0);
    }
  });
});
