import {
  type Locator,
  type Page,
  type Request,
  type Route,
} from "@playwright/test";

import { expect, releaseSharedPage, test } from "../_shared/session";

import { dbEnabled, withDb } from "../_shared/db";
import { makeStep, skipWithReason } from "../_shared/step";

/**
 * 診療入力設定 (frm203003) → tab 学習機能 → nhóm 学習リセット — 5 nút
 * 処置 / 病名 / パック / ガイド / 全て.
 *
 * Nguồn WinForm (userapp/src/OCHACOM/INP/Forms/frm203003.cs):
 *  - btnResetIntelli{Trt,Dis,Pac,Guid,All}_Click (dòng 516-550): mỗi nút gọi
 *    IntelliReset() = MsgBox OkCancel tiêu đề 「リセット」, câu
 *    「学習結果をリセットしてもよろしいですか？」. Cancel → dừng. OK → UPDATE NGAY:
 *      · PacReset  : update PACMST set USE_CNT = 0
 *      · GuidReset : update PACNAM set USE_CNT = 0
 *      · DisReset  : update <Get_strDis(Today)> set USE_CNT=0   (CHỈ bảng của hôm nay)
 *      · TrtReset  : update <Get_strTrt(Today)> set USE_CNT=0   (CHỈ bảng của hôm nay)
 *      · 全て      : Pac → Guid → Dis → Trt
 *    KHÔNG đợi F9 登録, KHÔNG đóng form, KHÔNG báo gì sau khi xong.
 *
 * Bên web (apps/web-tenant/src/features/treatments):
 *  - components/treatment-entry-setting-dialog.tsx `handleLearningReset`:
 *    `confirmDialog.okCancel(...)` (role="alertdialog", nút OK / キャンセル) →
 *    `useResetLearning` → POST /tenant/learning-reset/{treatments|diseases|packs|
 *    guides|all}, KHÔNG body. Lỗi → toast 「リセットに失敗しました。」.
 *  - SaaS không có bảng TRT theo ngày: mst_trt / mst_dis giữ mọi 改定 trong 1 bảng,
 *    khoá bằng version_id → "bảng của hôm nay" = version của view_mst_*_ver_active
 *    phủ ngày hôm nay (theo giờ tenant, JST).
 *
 * Nhóm testcase:
 *  - TC-UI / TC-CANCEL / TC-MOCK / TC-ERR: KHÔNG ghi DB. Hộp xác nhận bấm キャンセル
 *    hoặc request bị `page.route` chặn lại trả giả.
 *  - TC-DB-*: bấm OK THẬT, soi DB. Cần TEST_DB (đọc/ghi Postgres) + TEST_ALLOW_SAVE=1
 *    (Rule 18.1). beforeAll chụp lại MỌI use_cnt ≠ 0 của 4 bảng, afterAll ghi trả
 *    lại — kể cả khi testcase giữa chừng đỏ — nên dữ liệu học của tenant không mất.
 *    Trước mỗi TC-DB cũng ghi trả để mỗi nút bắt đầu từ cùng một trạng thái.
 *
 * CHẠY TUẦN TỰ, chung 1 page, login 1 lần. Luôn chạy CẢ FILE:
 *   npx playwright test tests/dialogs-management/learning-reset.spec.ts
 */

/** Cho phép bấm OK thật (ghi DB). Mặc định tắt (Rule 18.1). */
const ALLOW_SAVE = process.env.TEST_ALLOW_SAVE === "1";
const DB_WRITE_OK = dbEnabled && ALLOW_SAVE;
const DB_SKIP_REASON =
  "bấm OK thật sẽ ghi use_cnt = 0 — cần TEST_DB=1 (để chụp/khôi phục) và TEST_ALLOW_SAVE=1";

/** POST /tenant/learning-reset/{target} — cả 5 nút. */
const RESET_URL = /\/tenant\/learning-reset\/[a-z]+(\?|$)/;
/** F9 登録 của cùng dialog — reset KHÔNG được kéo theo request này. */
const SETTINGS_INP_URL = /\/tenant\/settings\/inp(\?|$)/;

// ── Nhãn / câu chữ lấy nguyên văn từ source ─────────────────────────────────
const DIALOG_TITLE = "診 療 入 力 設 定";
const CONFIRM_TITLE = "リセット";
const CONFIRM_MESSAGE = "学習結果をリセットしてもよろしいですか？";
const TOAST_FAILED = "リセットに失敗しました。";
const TOAST_SAVED = "登録しました。";

/** Nút → route, theo thứ tự trên màn (frm203003.Designer.cs, trên xuống dưới). */
const BUTTONS = [
  { label: "処置", route: "treatments" },
  { label: "病名", route: "diseases" },
  { label: "パック", route: "packs" },
  { label: "ガイド", route: "guides" },
  { label: "全て", route: "all" },
] as const;

// ── DB ────────────────────────────────────────────────────────────────────────
/** 4 bảng mang use_cnt mà 学習リセット đụng tới. */
const TABLES = ["mst_trt", "mst_dis", "pac_mst", "pac_nam"] as const;
type Table = (typeof TABLES)[number];

/** Hàng có use_cnt ≠ 0 lúc bắt đầu file — để ghi trả. */
type Snapshot = Record<Table, { ids: string[]; cnts: number[] }>;

/**
 * Số hàng use_cnt ≠ 0, tách "version hôm nay" khỏi "version khác" cho 2 bảng có
 * version. pac_mst / pac_nam không có version nên chỉ có `current`.
 */
type Counts = Record<Table, { current: number; other: number }>;

/** "Hôm nay" theo giờ tenant (JST) — giống ITenantClock phía BE. */
const TODAY_JST = `(now() AT TIME ZONE 'Asia/Tokyo')::date`;

function versionSql(verView: string): string {
  return `(SELECT version_id FROM ${verView}
               WHERE ${TODAY_JST} BETWEEN start_date AND end_date
               ORDER BY version_id DESC LIMIT 1)`;
}

async function takeSnapshot(): Promise<Snapshot> {
  return withDb(async (c) => {
    const snap = {} as Snapshot;
    for (const t of TABLES) {
      const { rows } = await c.query<{ id: string; use_cnt: number }>(
        `SELECT id::text AS id, use_cnt FROM ${t} WHERE use_cnt IS NOT NULL AND use_cnt <> 0`,
      );
      snap[t] = {
        ids: rows.map((r) => r.id),
        cnts: rows.map((r) => r.use_cnt),
      };
    }
    return snap;
  });
}

/** Ghi trả use_cnt đã chụp. Hàng lúc chụp = 0 thì reset cũng chỉ để 0, không cần đụng. */
async function restoreSnapshot(snap: Snapshot): Promise<void> {
  await withDb(async (c) => {
    for (const t of TABLES) {
      if (snap[t].ids.length === 0) continue;
      await c.query(
        `UPDATE ${t} AS x SET use_cnt = s.u
                   FROM unnest($1::uuid[], $2::int[]) AS s(id, u)
                  WHERE x.id = s.id`,
        [snap[t].ids, snap[t].cnts],
      );
    }
  });
}

async function readCounts(): Promise<Counts> {
  return withDb(async (c) => {
    const one = async (sql: string) =>
      Number((await c.query<{ n: string }>(sql)).rows[0]!.n);
    const nz = "deleted_at IS NULL AND use_cnt IS NOT NULL AND use_cnt <> 0";
    const trtVer = versionSql("view_mst_trt_ver_active");
    const disVer = versionSql("view_mst_dis_ver_active");
    return {
      mst_trt: {
        current: await one(
          `SELECT count(*) n FROM mst_trt WHERE ${nz} AND version_id = ${trtVer}`,
        ),
        other: await one(
          `SELECT count(*) n FROM mst_trt WHERE ${nz} AND version_id <> ${trtVer}`,
        ),
      },
      mst_dis: {
        current: await one(
          `SELECT count(*) n FROM mst_dis WHERE ${nz} AND version_id = ${disVer}`,
        ),
        other: await one(
          `SELECT count(*) n FROM mst_dis WHERE ${nz} AND version_id <> ${disVer}`,
        ),
      },
      pac_mst: {
        current: await one(`SELECT count(*) n FROM pac_mst WHERE ${nz}`),
        other: 0,
      },
      pac_nam: {
        current: await one(`SELECT count(*) n FROM pac_nam WHERE ${nz}`),
        other: 0,
      },
    };
  });
}

test.describe.configure({ mode: "serial" });

test.describe("診療入力設定 → 学習リセット (frm203003 btnResetIntelli*)", () => {
  let page: Page;
  let step: () => Promise<void>;
  let dialog: Locator;
  let panel: Locator;
  /** Hộp xác nhận của confirmDialog — role="alertdialog", tách khỏi dialog chính. */
  let confirm: Locator;
  let snapshot: Snapshot | null = null;

  function buttonOf(label: string): Locator {
    return panel.getByRole("button", { name: label, exact: true });
  }

  /**
   * Bấm F11 mở 診療入力設定 rồi sang tab 学習機能. Popover lịch sử 患者番号 (role
   * listbox "Suggestions") nuốt F11 nếu đang mở — xem giải thích ở
   * treatment-entry-setting-dialog.spec.ts `openDialog`.
   */
  async function openLearningTab() {
    if (!(await dialog.isVisible().catch(() => false))) {
      await expect(async () => {
        const patNoHistory = page.getByRole("listbox", { name: "Suggestions" });
        if (await patNoHistory.isVisible().catch(() => false)) {
          await page.keyboard.press("Escape");
          await expect(patNoHistory).toBeHidden({ timeout: 3000 });
        }
        await page.keyboard.press("F11");
        await expect(dialog).toBeVisible({ timeout: 5000 });
      }).toPass({ timeout: 60000, intervals: [1000, 2000, 3000] });
    }
    const tab = dialog.getByRole("tab", { name: "学習機能" });
    await tab.click();
    await expect(tab).toHaveAttribute("data-state", "active");
    await expect(buttonOf("全て")).toBeVisible();
  }

  /**
   * Ghi lại mọi request reset + F9 登録 trong lúc `fn` chạy. Không chặn gì — chỉ
   * nghe — nên dùng được cho cả ca ghi thật.
   */
  async function recordRequests(fn: () => Promise<void>) {
    const resets: Request[] = [];
    const settingsPuts: Request[] = [];
    const onReq = (r: Request) => {
      if (RESET_URL.test(r.url())) resets.push(r);
      if (SETTINGS_INP_URL.test(r.url()) && r.method() === "PUT")
        settingsPuts.push(r);
    };
    page.on("request", onReq);
    try {
      await fn();
    } finally {
      page.off("request", onReq);
    }
    return { resets, settingsPuts };
  }

  /** Bấm nút, chờ hộp xác nhận, chốt tiêu đề + câu + 2 nút. */
  async function clickAndExpectConfirm(label: string) {
    await buttonOf(label).click();
    await expect(confirm, `bấm 「${label}」 mà không hỏi xác nhận`).toBeVisible(
      { timeout: 10000 },
    );
    await expect(confirm).toContainText(CONFIRM_TITLE);
    await expect(confirm).toContainText(CONFIRM_MESSAGE);
    await expect(
      confirm.getByRole("button", { name: "OK", exact: true }),
    ).toBeVisible();
    await expect(
      confirm.getByRole("button", { name: "キャンセル", exact: true }),
    ).toBeVisible();
  }

  /** Bấm OK rồi chờ đúng 1 response reset. Trả về response. */
  async function confirmOk() {
    const res = page.waitForResponse((r) => RESET_URL.test(r.url()), {
      timeout: 30000,
    });
    await confirm.getByRole("button", { name: "OK", exact: true }).click();
    await expect(confirm).toBeHidden({ timeout: 10000 });
    return res;
  }

  test.beforeAll(async ({ authedPage }) => {
    page = authedPage;
    step = makeStep(page);

    if (DB_WRITE_OK) {
      snapshot = await takeSnapshot();
      console.log(
        "[snapshot] use_cnt ≠ 0: " +
          TABLES.map((t) => `${t}=${snapshot![t].ids.length}`).join(", "),
      );
    }

    await page.goto("/treatments", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-fkey="F11"]')).toBeVisible({
      timeout: 60000,
    });

    dialog = page.getByRole("dialog").filter({ hasText: DIALOG_TITLE });
    panel = dialog.getByRole("tabpanel");
    confirm = page.getByRole("alertdialog");
  });

  test.afterAll(async () => {
    try {
      if (snapshot) {
        await restoreSnapshot(snapshot);
        console.log("[snapshot] đã ghi trả use_cnt");
      }
    } finally {
      await releaseSharedPage(page);
    }
  });

  // ── Giao diện ────────────────────────────────────────────────────────────

  test("TC-UI-1 — 5 nút đúng nhãn, đúng thứ tự, đều bấm được", async () => {
    await openLearningTab();
    const group = panel
      .getByRole("heading", { name: "学習リセット" })
      .locator("..");
    const labels = (await group.getByRole("button").allInnerTexts()).map((t) =>
      t.trim(),
    );
    expect(labels).toEqual(BUTTONS.map((b) => b.label));
    for (const b of BUTTONS) await expect(buttonOf(b.label)).toBeEnabled();
    await step();
  });

  // ── Huỷ xác nhận: KHÔNG gửi gì ───────────────────────────────────────────

  test("TC-CANCEL-1 — mỗi nút hỏi xác nhận; キャンセル thì KHÔNG gửi request", async () => {
    await openLearningTab();
    const { resets } = await recordRequests(async () => {
      for (const b of BUTTONS) {
        await clickAndExpectConfirm(b.label);
        await confirm
          .getByRole("button", { name: "キャンセル", exact: true })
          .click();
        await expect(confirm).toBeHidden({ timeout: 10000 });
      }
      // Request (nếu lỡ có) bay ngay sau click — đợi một nhịp cho chắc.
      await page.waitForTimeout(1000);
    });
    expect(
      resets.map((r) => r.url()),
      "キャンセル mà vẫn reset",
    ).toEqual([]);
    await expect(
      dialog,
      "huỷ reset không được đóng 診療入力設定",
    ).toBeVisible();
    await step();
  });

  test("TC-CANCEL-2 — ESC trên hộp xác nhận = キャンセル (MsgBox OkCancel)", async () => {
    await openLearningTab();
    const { resets } = await recordRequests(async () => {
      await clickAndExpectConfirm("全て");
      await page.keyboard.press("Escape");
      await expect(confirm).toBeHidden({ timeout: 10000 });
      await page.waitForTimeout(1000);
    });
    expect(
      resets.map((r) => r.url()),
      "ESC mà vẫn reset",
    ).toEqual([]);
    await expect(
      dialog,
      "ESC chỉ đóng hộp xác nhận, không đóng dialog",
    ).toBeVisible();
    await step();
  });

  // ── OK nhưng chặn request: soi URL / body / hành vi màn ──────────────────

  test("TC-MOCK-1 — OK gửi POST đúng route, không body, không kéo theo F9 登録", async () => {
    await openLearningTab();
    await page.route(RESET_URL, (route: Route) =>
      route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true, data: true }),
      }),
    );
    try {
      for (const b of BUTTONS) {
        const { resets, settingsPuts } = await recordRequests(async () => {
          await clickAndExpectConfirm(b.label);
          const res = await confirmOk();
          expect(res.status()).toBe(200);
        });
        expect(resets, `「${b.label}」 phải gửi đúng 1 request`).toHaveLength(
          1,
        );
        const req = resets[0]!;
        expect(req.method()).toBe("POST");
        expect(new URL(req.url()).pathname).toMatch(
          new RegExp(`/tenant/learning-reset/${b.route}$`),
        );
        expect(req.postData() ?? "", "reset không mang body").toBe("");
        expect(settingsPuts, "reset không được lưu luôn cài đặt").toHaveLength(
          0,
        );

        // WinForm: không đóng form, không báo gì khi xong.
        await expect(
          dialog,
          `「${b.label}」 xong mà dialog đóng`,
        ).toBeVisible();
        await expect(page.getByText(TOAST_SAVED)).toHaveCount(0);
        await expect(page.getByText(TOAST_FAILED)).toHaveCount(0);
      }
    } finally {
      await page.unroute(RESET_URL);
    }
    await step();
  });

  test("TC-ERR-1 — API lỗi: toast 「リセットに失敗しました。」, dialog vẫn mở", async () => {
    await openLearningTab();
    await page.route(RESET_URL, (route: Route) =>
      route.fulfill({
        status: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, message: "boom" }),
      }),
    );
    try {
      await clickAndExpectConfirm("パック");
      await confirmOk();
      await expect(page.getByText(TOAST_FAILED)).toBeVisible({
        timeout: 15000,
      });
      await expect(dialog).toBeVisible();
      await expect(
        buttonOf("パック"),
        "lỗi xong nút phải mở lại",
      ).toBeEnabled();
    } finally {
      await page.unroute(RESET_URL);
    }
    await step();
  });

  // ── OK thật: soi DB ──────────────────────────────────────────────────────

  /**
   * Bấm OK thật cho `label`, rồi so số hàng use_cnt ≠ 0 trước/sau.
   * `cleared` = các (bảng, phần) phải về 0; mọi phần còn lại phải GIỮ NGUYÊN.
   */
  async function realResetAndCompare(
    label: string,
    cleared: ReadonlyArray<`${Table}.current`>,
  ) {
    await restoreSnapshot(snapshot!);
    const before = await readCounts();
    console.log(`[${label}] trước: ${JSON.stringify(before)}`);
    for (const key of cleared) {
      const [t] = key.split(".") as [Table];
      expect(
        before[t].current,
        `dữ liệu test: ${key} đã = 0 sẵn, không chứng minh được reset`,
      ).toBeGreaterThan(0);
    }

    await openLearningTab();
    const { resets } = await recordRequests(async () => {
      await clickAndExpectConfirm(label);
      const res = await confirmOk();
      const body = res.ok() ? "" : await res.text().catch(() => "");
      expect(res.status(), `API từ chối reset 「${label}」: ${body}`).toBe(200);
    });
    expect(resets).toHaveLength(1);
    await expect(dialog).toBeVisible();

    const after = await readCounts();
    console.log(`[${label}] sau:   ${JSON.stringify(after)}`);
    for (const t of TABLES) {
      const expectCurrent = cleared.includes(`${t}.current`)
        ? 0
        : before[t].current;
      expect(after[t].current, `${t} (version hôm nay)`).toBe(expectCurrent);
      // Version khác KHÔNG BAO GIỜ bị đụng — WinForm chỉ update bảng của hôm nay.
      expect(after[t].other, `${t} (version khác hôm nay)`).toBe(
        before[t].other,
      );
    }
  }

  test("TC-DB-1 — 処置: chỉ mst_trt version hôm nay về 0", async () => {
    skipWithReason(!DB_WRITE_OK, DB_SKIP_REASON);
    await realResetAndCompare("処置", ["mst_trt.current"]);
    await step();
  });

  test("TC-DB-2 — 病名: chỉ mst_dis version hôm nay về 0", async () => {
    skipWithReason(!DB_WRITE_OK, DB_SKIP_REASON);
    await realResetAndCompare("病名", ["mst_dis.current"]);
    await step();
  });

  test("TC-DB-3 — パック: chỉ pac_mst về 0", async () => {
    skipWithReason(!DB_WRITE_OK, DB_SKIP_REASON);
    await realResetAndCompare("パック", ["pac_mst.current"]);
    await step();
  });

  test("TC-DB-4 — ガイド: chỉ pac_nam về 0", async () => {
    skipWithReason(!DB_WRITE_OK, DB_SKIP_REASON);
    await realResetAndCompare("ガイド", ["pac_nam.current"]);
    await step();
  });

  test("TC-DB-5 — 全て: cả 4, version cũ của 処置/病名 vẫn giữ", async () => {
    skipWithReason(!DB_WRITE_OK, DB_SKIP_REASON);
    await realResetAndCompare("全て", [
      "pac_mst.current",
      "pac_nam.current",
      "mst_dis.current",
      "mst_trt.current",
    ]);
    await step();
  });

  test("TC-DB-6 — reset rồi thoát F10 (không 登録): KHÔNG hoàn tác", async () => {
    skipWithReason(!DB_WRITE_OK, DB_SKIP_REASON);
    await restoreSnapshot(snapshot!);
    await openLearningTab();
    await clickAndExpectConfirm("パック");
    expect((await confirmOk()).status()).toBe(200);

    await dialog.getByRole("button", { name: "F10 戻る" }).click();
    await expect(dialog).toBeHidden({ timeout: 10000 });

    const after = await readCounts();
    expect(
      after.pac_mst.current,
      "đóng dialog không lưu mà use_cnt quay lại",
    ).toBe(0);
    await step();
  });
});
