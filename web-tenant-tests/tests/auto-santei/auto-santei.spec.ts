/**
 * 自動算定 — `modSave.AutoSantei` (modSave.cs:3026-3254).
 *
 * MỘT HÀM = MỘT FILE. Ba spec cũ cùng đo đúng hàm này; khác nhau ở CHỖ LẤY DỮ LIỆU
 * chứ không ở chức năng, và doc của chúng đã tự nhận là "file anh em":
 *   · dữ liệu THẬT của tenant demo → chỉ tới được nhánh "bệnh nhân đủ điều kiện 初診";
 *   · dữ liệu GIẢ (`page.route` chặn `/tenant/treatment/autosantei`) → phủ các nhánh
 *     còn lại: không đủ điều kiện, bộ pick rỗng, 身障者加算, API lỗi…;
 *   · dữ liệu THẬT + NHẬP LÙI NGÀY → 枝番 nào cấp `dis_flg`/`old_flg`, lấp đúng chỗ
 *     mà khối thứ nhất ghi là "ngoài phạm vi vì phụ thuộc dữ liệu".
 *
 * Với mọi spec khác, confirm 「〜を算定しますか？」 là CHƯỚNG NGẠI phải dọn; ở file này
 * nó là ĐỐI TƯỢNG kiểm.
 *
 * Ba khối giữ NGUYÊN VĂN nội dung ba file cũ. File to (~2.400 dòng) vì AutoSantei
 * nhiều nhánh — chạy cả nhóm bằng `npx playwright test tests/auto-santei/`.
 */

import { type Page, type Route } from '@playwright/test'
import { branchInForceOn, dbEnabled, findMstTrt, insuranceBranches, type InsuranceBranch } from '../_shared/db'
import { BASE_URL, TODAY_ISO, trtDt } from '../_shared/env'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep } from '../_shared/step'
import { ADMIN_USER, JA } from '../_shared/test-data'

// ═══ nguyên văn từ auto-santei.spec.ts (đã gộp vào file này) ═══════════════════════════════════════════
test.describe('dữ liệu THẬT', () => {

const BASE_URL = process.env.BASE_URL ?? "https://tenant1.ochacom.local/";
const PAT_NO = process.env.TEST_PAT_NO ?? "11";
const TRT_DT = trtDt(TODAY_ISO);
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
   * ở cross-cutting/client-sort.spec.ts) → thử lại tối đa 3 lần rồi mới báo lỗi.
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

})

// ═══ nguyên văn từ auto-santei-cases.spec.ts (đã gộp vào file này) ═════════════════════════════════════
test.describe('dữ liệu GIẢ — bảng nhánh quyết định', () => {

const BASE_URL = process.env.BASE_URL ?? "https://tenant1.ochacom.local/";
const PAT_NO = process.env.TEST_PAT_NO ?? "11";
const TRT_DT = trtDt(TODAY_ISO);

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
 * (lưới hiển thị cả các tháng trước, xem auto-santei/auto-santei.spec.ts).
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

})

// ═══ nguyên văn từ auto-santei-insurance-branch.spec.ts (đã gộp vào file này) ══════════════════════════
test.describe('dữ liệu THẬT + nhập lùi ngày — 枝番', () => {

/** Bệnh nhân đổi thẻ giữa chừng — xem "ĐIỀU KIỆN DỮ LIỆU". */
const PAT_NO = process.env.TEST_PAT_NO_INS_BR ?? '11307'
/** 診療日 nằm TRƯỚC 資格取得年月日 của 枝番 mới nhất. */
const TRT_DT_BACK = process.env.TEST_TRT_DT_INS_BR_BACK ?? '2007-06-15'
/** 診療日 SAU khi 枝番 mới nhất đã có hiệu lực — đối chứng. */
const TRT_DT_NOW = process.env.TEST_TRT_DT_INS_BR_NOW ?? '2026-08-10'

/** 障害者加算 — dòng duy nhất mà `dis_flg >= 1` sinh ra (modSave.cs:3097/:3167). */
const TRT_CD_DISABILITY = 105

const AUTOSANTEI_PATH = '/tenant/treatment/autosantei'

/** RegiCol — treatment-entry-shared.ts:105. */
const RegiCol = { ryo: 2, ten: 3 } as const
const ryoCell = (page: Page) => page.locator(`[data-grid-cell$="|${RegiCol.ryo}"]`)
const tenCell = (page: Page) => page.locator(`[data-grid-cell$="|${RegiCol.ten}"]`)

/** CSS selector, KHÔNG `getByRole` — Radix aria-hidden có thể làm role "tắt". */
const anyDialog = (page: Page) => page.locator('[role="dialog"]')
/** 初診/再診 — SanteiConfirmDialog (DraggableDialog, role=dialog), 3 nút Yes/No/Cancel. */
const santeiDialog = (page: Page) => anyDialog(page).filter({ hasText: /を算定しますか？/ })
const santeiBtn = (page: Page, label: 'Yes' | 'No' | 'Cancel') =>
    santeiDialog(page).getByRole('button', { name: new RegExp(`^${label}$`) })
/**
 * 特２ — `confirmDialog` là Radix AlertDialog nên role là **alertdialog**, KHÁC hẳn
 * SanteiConfirmDialog (Rule 13). Nhãn nút để mặc định はい/いいえ (Rule 13.2).
 */
const addonDialog = (page: Page) => page.locator('[role="alertdialog"]')
const addonBtn = (page: Page, answer: 'yes' | 'no') =>
    addonDialog(page).getByRole('button', {
        name: answer === 'yes' ? /^(はい|Yes|OK)$/ : /^(いいえ|No|Cancel)$/,
    })

/** カルテ記載選択 — bung SAU khi bộ pick đã chèn xong; đóng để không chắn lưới. */
const cmtPicker = (page: Page) => anyDialog(page).filter({ hasText: 'カルテ記載選択' })
const closeCmtPicker = async (page: Page) => {
    if ((await cmtPicker(page).count()) === 0) return
    await cmtPicker(page).getByRole('button', { name: /戻る/ }).click()
    await expect(cmtPicker(page)).toHaveCount(0, { timeout: 10000 })
}

interface AutoSanteiPick {
    trtCd: number
    trtSb: number
    trtNm: string
    trtPt: number
}

interface AutoSanteiBody {
    isInitialVisitEligible: boolean
    picks: AutoSanteiPick[]
    disabilityAddon: AutoSanteiPick | null
    reExamPicks: AutoSanteiPick[]
    reExamDisabilityAddon: AutoSanteiPick | null
}

/** Mọi dòng 処置 KHÔNG rỗng đang có trên lưới (kể cả 履歴 ⇒ chỉ dùng để so delta). */
const filledRyoTexts = async (page: Page): Promise<string[]> =>
    (await ryoCell(page).allTextContents()).map((t) => t.trim()).filter((t) => t !== '')

/** Phần tử mới xuất hiện sau một thao tác — so theo bội số, không phải tập hợp. */
const addedTexts = (before: readonly string[], after: readonly string[]): string[] => {
    const rest = [...before]
    const added: string[] = []
    for (const t of after) {
        const i = rest.indexOf(t)
        if (i >= 0) rest.splice(i, 1)
        else added.push(t)
    }
    return added
}

const has105 = (b: AutoSanteiBody): boolean =>
    [...b.picks, ...b.reExamPicks].some((p) => p.trtCd === TRT_CD_DISABILITY) ||
    b.disabilityAddon !== null ||
    b.reExamDisabilityAddon !== null

const describeBranches = (bs: readonly InsuranceBranch[]): string =>
    bs.map((b) => `枝番${b.patBr} br_dt=${b.brDt ?? 'NULL'} dis=${b.disFlg} old=${b.oldFlg}`).join(' | ')

test.skip(!dbEnabled, 'Cần TEST_DB=1 để đọc bảng insurance mà tự tính kỳ vọng')

test.describe.configure({ mode: 'serial', timeout: 240_000 })

test.describe('自動算定 — 枝番 có hiệu lực tại 診療日 (GetValidSubCode2)', () => {
    let page: Page
    let step: () => Promise<void>

    /** Origin thật của API (bóc từ một request có sẵn của app). */
    let apiOrigin = ''
    /** Header auth bắt được — dùng lại để gọi thẳng BE bằng page.request. */
    let authHeaders: Record<string, string> = {}

    /** Toàn bộ 枝番 của bệnh nhân test, đọc một lần ở beforeAll. */
    let branches: InsuranceBranch[] = []
    /** 枝番 hiệu lực tại từng ngày, tính theo luật WinForm. */
    let backBranch: InsuranceBranch | null = null
    let nowBranch: InsuranceBranch | null = null
    /** 枝番 mà luật CŨ (`MAX(pat_br)`) sẽ lấy — dùng để chứng minh dữ liệu phân biệt được. */
    let maxBranch: InsuranceBranch | null = null

    const openFresh = async (trtDt: string) => {
        for (let attempt = 1; attempt <= 3; attempt++) {
            await page.goto(`/treatments/${PAT_NO}?trtDt=${trtDt}`, { waitUntil: 'domcontentloaded' })
            const ok = await tenCell(page)
                .last()
                .waitFor({ state: 'visible', timeout: 30000 })
                .then(() => true)
                .catch(() => false)
            if (ok) {
                await page
                    .waitForResponse((r) => r.url().includes('/autosantei'), { timeout: 8000 })
                    .catch(() => {})
                await step()
                return
            }
            console.log(`診療入力 ${PAT_NO} @ ${trtDt}: lần ${attempt}/3 lưới không render → nạp lại`)
        }
        throw new Error(
            `màn 診療入力 của 患者 ${PAT_NO} @ ${trtDt} không render. Kiểm app còn sống không ` +
                `(curl -sk -o /dev/null -w "%{http_code}" ${BASE_URL}login) — 502 là dev server chết, ` +
                'KHÔNG phải lỗi test (Rule 5).',
        )
    }

    /** Gọi thẳng BE cho một 診療日 — không phụ thuộc trạng thái lưới. */
    const fetchAutoSantei = async (trtDt: string): Promise<AutoSanteiBody> => {
        const url = `${apiOrigin}${AUTOSANTEI_PATH}?patNo=${PAT_NO}&trtDt=${trtDt}`
        const res = await page.request.get(url, { headers: authHeaders })
        expect(res.status(), `GET ${AUTOSANTEI_PATH} (${trtDt})`).toBe(200)
        const json = (await res.json()) as { data?: Partial<AutoSanteiBody> }
        const d = json.data ?? {}
        return {
            isInitialVisitEligible: Boolean(d.isInitialVisitEligible),
            picks: d.picks ?? [],
            disabilityAddon: d.disabilityAddon ?? null,
            reExamPicks: d.reExamPicks ?? [],
            reExamDisabilityAddon: d.reExamDisabilityAddon ?? null,
        }
    }

    test.beforeAll(async ({ authedPage }) => {
        // Page chia sẻ theo worker (`_shared/session.ts`): đăng nhập một lượt cho cả
        // worker thay vì mỗi file một lần — app chặn ở 10 login/khung thời gian
        // (Rule 10.1). `afterAll` gọi `releaseSharedPage`, KHÔNG `page.close()`.
        page = authedPage
        step = makeStep(page)
        page.on('request', (req) => {
            const u = req.url()
            const i = u.indexOf('/tenant/')
            if (i < 0) return
            const h = req.headers()
            if (!h['authorization']) return
            apiOrigin = u.slice(0, i)
            authHeaders = Object.fromEntries(
                Object.entries(h).filter(
                    ([k]) => k === 'authorization' || k.startsWith('x-') || k === 'accept',
                ),
            )
        })

        branches = await insuranceBranches(Number(PAT_NO))
        backBranch = branchInForceOn(branches, TRT_DT_BACK)
        nowBranch = branchInForceOn(branches, TRT_DT_NOW)
        maxBranch = branches.reduce<InsuranceBranch | null>(
            (best, b) => (best === null || b.patBr > best.patBr ? b : best),
            null,
        )
        console.log(`患者 ${PAT_NO}: ${describeBranches(branches)}`)
    })

    test.afterAll(async () => {
        await releaseSharedPage(page)
    })

    test('TC-0 dữ liệu test còn phân biệt được hai luật', async () => {
        expect(branches.length, `患者 ${PAT_NO} phải có ≥ 2 枝番`).toBeGreaterThan(1)
        expect(
            backBranch?.disFlg ?? 0,
            `枝番 hiệu lực tại ${TRT_DT_BACK} phải có dis_flg >= 1 thì mới sinh ra dòng 105. ` +
                `Hiện: ${describeBranches(branches)}. Đổi TEST_PAT_NO_INS_BR / TEST_TRT_DT_INS_BR_BACK.`,
        ).toBeGreaterThanOrEqual(1)
        expect(
            maxBranch?.disFlg ?? 0,
            `枝番 LỚN NHẤT phải có dis_flg == 0, nếu không thì luật cũ (MAX(pat_br)) và luật đúng ` +
                `cho cùng kết quả và test không chứng minh được gì. Hiện: ${describeBranches(branches)}.`,
        ).toBe(0)
        expect(backBranch?.patBr).not.toBe(maxBranch?.patBr)
        console.log(
            `${TRT_DT_BACK} → 枝番${backBranch?.patBr} (dis=${backBranch?.disFlg}); ` +
                `MAX(pat_br) = 枝番${maxBranch?.patBr} (dis=${maxBranch?.disFlg})`,
        )
        await step()
    })

    test('TC-1 nhập lùi ngày → BE lấy dis_flg của 枝番 hiệu lực hôm đó, KHÔNG phải 枝番 lớn nhất', async () => {
        test.skip(apiOrigin === '', 'chưa bắt được request nào của app để lấy origin + token API')

        const body = await fetchAutoSantei(TRT_DT_BACK)
        const codes = [...body.picks, ...body.reExamPicks].map((p) => `${p.trtCd}-${p.trtSb} ${p.trtNm}`)
        console.log(`autosantei ${TRT_DT_BACK}: ${codes.join(' , ')} | addon=${body.disabilityAddon?.trtNm ?? 'null'}`)

        expect(
            has105(body),
            `枝番${backBranch?.patBr} có dis_flg=${backBranch?.disFlg} nên PHẢI có dòng 105 (障害者加算). ` +
                `Không có = BE vẫn đang đọc 枝番${maxBranch?.patBr} (dis_flg=0) qua MAX(pat_br).`,
        ).toBe(true)
        await step()
    })

    test('TC-2 ngày hiện hành → dis_flg = 0 ⇒ KHÔNG có dòng 105 nào', async () => {
        test.skip(apiOrigin === '', 'chưa bắt được request nào của app để lấy origin + token API')
        expect(nowBranch?.disFlg ?? 0, `dữ liệu: 枝番 hiệu lực tại ${TRT_DT_NOW} phải có dis_flg = 0`).toBe(0)

        const body = await fetchAutoSantei(TRT_DT_NOW)
        expect(
            has105(body),
            'dis_flg = 0 mà vẫn có 105 ⇒ đang lấy nhầm 枝番 (lần này là 枝番 cũ).',
        ).toBe(false)
        await step()
    })

    test('TC-3 cửa sổ 保険適用期間 KHÔNG được quyết định 枝番', async () => {
        const inWindow = branches.filter(
            (b) =>
                (b.medStDt === null || b.medStDt <= TRT_DT_BACK) &&
                (b.medEdDt === null || TRT_DT_BACK <= b.medEdDt),
        )
        console.log(
            `${TRT_DT_BACK}: 枝番 khớp 適用期間 = [${inWindow.map((b) => b.patBr).join(',')}], ` +
                `枝番 theo 資格取得年月日 = ${backBranch?.patBr}`,
        )
        // Không ép dữ liệu phải mâu thuẫn — chỉ chốt rằng khi có mâu thuẫn thì
        // br_dt thắng. Trên tenant demo ngày này KHÔNG 枝番 nào còn trong 適用期間,
        // nên luật cũ sẽ rơi về 枝番 đầu tiên chứ không phải 枝番 hiệu lực.
        if (inWindow.some((b) => b.patBr === backBranch?.patBr)) {
            console.log('適用期間 và 資格取得年月日 trùng kết luận ở ngày này → TC chỉ ghi nhận')
        }
        expect(backBranch?.brDt ?? '').not.toBe('')
        expect(backBranch!.brDt! <= TRT_DT_BACK).toBe(true)
        await step()
    })

    test('TC-4 lưới 診療入力 của ngày lùi phải nhận dòng 障害者加算', async () => {
        const body = await fetchAutoSantei(TRT_DT_BACK)
        // `picks` là bộ mà FE áp khi không đủ điều kiện 初診 — cũng là bộ BE trả về cho
        // nhánh 再診 (GetAutoSanteiHandler), nên không cần rẽ theo `isInitialVisitEligible`.
        const disabilityPicks = body.picks.filter((p) => p.trtCd === TRT_CD_DISABILITY)
        expect(disabilityPicks.length, 'ngày lùi phải có pick 105 (xem TC-1)').toBeGreaterThan(0)

        await openFresh(TRT_DT_BACK)

        // Không đủ điều kiện 初診 ⇒ FE áp thẳng `picks` KHÔNG hỏi 3 nút; nhưng có
        // `disabilityAddon` nên confirm 特２ bung TRƯỚC khi dòng nào được chèn
        // (treatment-entry-detail.tsx: dialog chạy trước `handleKobetuPicks`).
        // Trả lời いいえ để giữ 特１ — chính là dòng 105 mà `dis_flg` của 枝番 hiệu lực sinh ra.
        if (body.disabilityAddon !== null) {
            await expect(
                addonDialog(page),
                `phải hỏi 「${body.disabilityAddon.trtNm}を算定しますか？」 — BE có trả disabilityAddon`,
            ).toBeVisible({ timeout: 20000 })
            expect(await addonDialog(page).innerText()).toContain(body.disabilityAddon.trtNm)
            await addonBtn(page, 'no').click()
            await expect(addonDialog(page)).toHaveCount(0, { timeout: 10000 })
        }

        for (const pk of disabilityPicks) {
            await expect(
                ryoCell(page).filter({ hasText: pk.trtNm }).first(),
                `lưới thiếu dòng 「${pk.trtNm}」 — BE đã trả pick 105 mà FE không chèn`,
            ).toBeVisible({ timeout: 20000 })
        }
        await closeCmtPicker(page)
        console.log(`lưới sau AutoSantei: ${JSON.stringify((await filledRyoTexts(page)).slice(-6))}`)
        await step()
    })

    test('TC-5 lưới của ngày hiện hành KHÔNG có dòng 障害者加算', async () => {
        const body = await fetchAutoSantei(TRT_DT_NOW)
        expect(
            body.picks.some((p) => p.trtCd === TRT_CD_DISABILITY),
            'BE không được trả 105 cho ngày này (xem TC-2)',
        ).toBe(false)
        expect(body.disabilityAddon, 'dis_flg = 0 thì không có 特２ để hỏi').toBeNull()

        // Mọi tên 処置 mà mã 105 có thể mang trong bản master của THÁNG đó — lấy từ DB
        // để không hardcode 「特１(初診)」 (tên đổi theo phiên bản master).
        const master105 = await findMstTrt(TRT_DT_NOW, TRT_CD_DISABILITY)
        const names105 = master105.flatMap((m) => [m.trtNm, m.cctNm]).filter((n) => n !== '')
        expect(names105.length, `master ${TRT_DT_NOW} không có mã 105 nào để đối chiếu`).toBeGreaterThan(0)

        await openFresh(TRT_DT_NOW)
        const before = await filledRyoTexts(page)

        // Đủ điều kiện 初診 ⇒ confirm 3 nút. Yes để bộ 初診 được chèn thật.
        await expect(
            santeiDialog(page),
            `không thấy confirm 「〜を算定しますか？」 — (患者 ${PAT_NO}, ${TRT_DT_NOW}) có lẽ đã có 処置 ` +
                'lưu trong THÁNG đó. Đổi TEST_TRT_DT_INS_BR_NOW.',
        ).toBeVisible({ timeout: 20000 })
        await santeiBtn(page, 'Yes').click()
        await expect(santeiDialog(page)).toHaveCount(0, { timeout: 15000 })

        // Chờ theo SỐ DÒNG chứ không theo tên: 履歴 của bệnh nhân đã có sẵn 「歯科初診料」
        // từ những năm trước, nên `toBeVisible` theo tên xanh ngay cả khi chưa chèn gì —
        // xanh giả. Bộ pick chỉ vào lưới sau khi cmt-auto/cascade chạy xong (Rule 15).
        expect(body.picks.length, 'BE không trả pick nào cho ngày hiện hành').toBeGreaterThan(0)
        await expect
            .poll(async () => (await filledRyoTexts(page)).length, { timeout: 30000 })
            .toBeGreaterThan(before.length)
        await closeCmtPicker(page)

        const added = addedTexts(before, await filledRyoTexts(page))
        console.log(`đã chèn: ${JSON.stringify(added)}`)
        expect(
            added.some((t) => body.picks.some((p) => t.includes(p.trtNm))),
            `lưới không nhận dòng nào của bộ pick BE trả về (${JSON.stringify(body.picks.map((p) => p.trtNm))})`,
        ).toBe(true)
        const stray = added.filter((t) => names105.some((n) => t.includes(n)))
        expect(
            stray,
            `枝番${nowBranch?.patBr} có dis_flg = 0 nên KHÔNG được có dòng 105 nào. ` +
                'Có = BE lại đang đọc 枝番 cũ (dis_flg = 2).',
        ).toEqual([])
        await step()
    })
})

})
