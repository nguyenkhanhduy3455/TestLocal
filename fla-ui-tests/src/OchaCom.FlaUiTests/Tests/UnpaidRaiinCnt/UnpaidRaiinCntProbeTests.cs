using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.AccountingFocusedDay;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;
using OchaCom.FlaUiTests.Tests.UnpaidSyosinFlag;

namespace OchaCom.FlaUiTests.Tests.UnpaidRaiinCnt;

/// <summary>
/// <b>PROBE — 当日来院回数 (<c>UNPAID.TRT_CNT</c>) mà F8 会計 ghi ra. KHÔNG assert.</b>
///
/// Bước 2 của <c>fla-ui-tests/PROBE-GUIDELINE.md</c>: chưa biết app thật hành xử ra sao
/// thì đo trước, đừng viết assert theo phỏng đoán rồi chạy cả fixture để xem nó đỏ ở đâu.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// CÂU HỎI ĐANG ĐO
/// ═══════════════════════════════════════════════════════════════════════════
/// Nửa WinForm của <c>web-tenant-tests/tests/unpaid-raiin-cnt-parity.spec.ts</c>
/// (ISSUE-14). Bản port bỏ qua <c>intSelectRaiin</c> ở cả 5 chỗ — <c>trtCnt = 1</c> cứng,
/// <c>VisitsNo = 0</c>, <c>AccUnitCalculator</c> không có tham số 来院回数, và
/// <c>UnpaidDayRows.ForDay</c> lọc cứng <c>trt_cnt ∈ {1, 101}</c>. Luồng này đo
/// <b>đáp án WinForm</b> để bản web có mốc mà khớp.
///
/// <code>
///  KQ-1  Ngày test dựng được thành 2 lượt không? ORACLE ra điểm/sflg bao nhiêu?
///  KQ-2  Lưới thật trông thế nào — ba dòng seed có hiện ra đúng thứ tự không?
///        (và: mỗi dòng có mang ô 日 riêng không — quyết định cách đặt con trỏ)
///  KQ-3  UNPAID đang có gì TRƯỚC khi chạy?
///  KQ-4  F8 từ dòng LƯỢT 1 → chuỗi hộp thoại nào, UNPAID.TRT_CNT ra mấy, SCORE ra mấy?
///  KQ-5  F8 từ dòng LƯỢT 2 → sinh dòng mới hay ĐÈ dòng lượt 1? SCORE của lượt 2?
///  KQ-6  SFLG hai lượt có giống nhau không (modAcc quét theo NGÀY, không lọc 来院回数)?
///  KQ-7  日計 trên lưới có bằng tổng điểm hai lượt không?
/// </code>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ⚠️ LUỒNG NÀY GHI DB — hai chỗ
/// ═══════════════════════════════════════════════════════════════════════════
/// <list type="number">
/// <item><b><c>TRNTRN</c></b>: seed 3 dòng vào ngày test (dải <c>disp_no</c> 9101-9103).
///       Gỡ ở <c>[OneTimeTearDown]</c>, và <see cref="TwoVisitDay.Build"/> cũng tự dọn
///       dải đó trước khi chèn nên lượt chạy hỏng giữa chừng không cộng dồn.</item>
/// <item><b><c>UNPAID</c></b>: F8 chạy TRỌN VẸN qua <c>deleteTrtDtUnPaid</c> + insert —
///       đó chính là thứ cần đọc, và <c>modAcc.cs</c> không có transaction nào để lui.
///       Fixture chụp ảnh UNPAID của NGÀY TEST trước, khôi phục sau.</item>
/// </list>
///
/// <para>Nằm sau <c>parity.allowSave</c>. Trỏ <c>patient.patNo</c> vào bệnh nhân TEST —
/// khôi phục là đường lui, không phải giấy phép.</para>
///
/// <para>Chạy: <c>.\run-unpaid-raiin-cnt.ps1 -Diagnostics</c></para>
/// </summary>
[TestFixture]
[Explicit("PROBE — chỉ chạy đích danh, và nó GHI DB (TRNTRN seed + UNPAID)")]
[Category("unpaid-raiin-cnt")]
public sealed class UnpaidRaiinCntProbeTests : UiTestBase
{
    private AccountingDayFlow _flow = null!;
    private RaiinCntDb? _db;
    private TwoVisitDay.Plan? _plan;
    private IReadOnlyList<RaiinCntDb.UnpaidRow>? _snapshot;

    /// <summary>
    /// Tắt watcher. Chuỗi F8 toàn 「…続けますか？」/「…よろしいですか。」/
    /// 「…作成してよろしいですか?」 mà với chúng phủ định = BỎ CUỘC — watcher bấm 「いいえ」
    /// hộ sẽ huỷ chuỗi trước khi 未精算 kịp được ghi, và probe kết luận 「app không ghi gì」
    /// trong khi thật ra chính nó chặn.
    /// </summary>
    protected override string[] NuisanceDialogPatterns => [];

    protected override string? FixturePreflightSkipReason()
    {
        if (!Settings.Parity.AllowSave)
            return "chưa bật parity.allowSave. Luồng này seed TRNTRN và để F8 chạy TRỌN VẸN " +
                   "nên GHI THẬT vào UNPAID (modAcc.cs không có transaction). Nó tự khôi phục " +
                   "theo ảnh chụp, nhưng đó là đường lui chứ không phải giấy phép — trỏ " +
                   "patient.patNo vào bệnh nhân TEST trước. Chạy: .\\run-unpaid-raiin-cnt.ps1 -Diagnostics";

        if (!Settings.Db.Enabled || string.IsNullOrWhiteSpace(Settings.Db.ConnectionString))
            return "cần db.connectionString: trt_cnt/score của UNPAID không hiện trên UI, " +
                   "và ngày 2 lượt khám phải seed thẳng vào TRNTRN";

        return null;
    }

    protected override void PrepareDataBeforeApp()
    {
        _db = RaiinCntDb.CreateOrNull(Settings);
        if (_db is null) return;

        _snapshot = _db.ReadUnpaid(PatNo, TrtDate);
        _plan = TwoVisitDay.Build(_db, PatNo, TrtDate);

        TestContext.Out.WriteLine(
            $"ảnh chụp UNPAID ngày {TrtDate:yyyy-MM-dd} của bệnh nhân {PatNo}: {_snapshot.Count} dòng");
        foreach (var line in _plan.Describe()) TestContext.Out.WriteLine(line);
        if (_plan.Blocker is not null)
            TestContext.Out.WriteLine("!! KHÔNG DỰNG ĐƯỢC NGÀY 2 LƯỢT: " + _plan.Blocker);
    }

    [OneTimeSetUp]
    public void ProbeOneTimeSetUp() => _flow = new AccountingDayFlow(App, Screen);

    [OneTimeTearDown]
    public void RestoreEverything()
    {
        if (_db is null) return;

        try
        {
            var removed = _db.RemoveSeedRows(PatNo);
            TestContext.Out.WriteLine($"ĐÃ GỠ {removed} dòng 処置 seed (disp_no >= {RaiinCntDb.SeedDispNoBase})");
        }
        catch (Exception e)
        {
            TestContext.Error.WriteLine(
                $"!! KHÔNG GỠ ĐƯỢC dòng seed: {e.Message}. Gỡ tay: " +
                $"DELETE FROM TRNTRN WHERE pat_no = {PatNo} AND disp_no >= {RaiinCntDb.SeedDispNoBase};");
        }

        if (_snapshot is null) return;
        try
        {
            _db.RestoreUnpaidForDay(PatNo, TrtDate, _snapshot);
            var now = _db.ReadUnpaid(PatNo, TrtDate);
            TestContext.Out.WriteLine(
                $"ĐÃ TRẢ LẠI UNPAID ngày {TrtDate:yyyy-MM-dd}: {now.Count} dòng (ảnh chụp {_snapshot.Count})");
        }
        catch (Exception e)
        {
            TestContext.Error.WriteLine(
                $"!! KHÔNG TRẢ LẠI ĐƯỢC UNPAID: {e.Message}. Ảnh chụp cần khôi phục:");
            foreach (var r in _snapshot) TestContext.Error.WriteLine("        " + r);
        }
    }

    private static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); } catch { /* không có console */ }
    }

    private static void Kq(string tag, string line) => Log($"=== KQ-{tag} === {line}");

    private static void Safe(string what, Action action)
    {
        try { action(); }
        catch (Exception e) { Log($"    !! bước 「{what}」 lỗi: {e.GetType().Name}: {e.Message}"); }
    }

    [Test, Order(0)]
    [Description("Tc0 — PROBE: F8 ở lượt 1 rồi lượt 2 ghi ra UNPAID.TRT_CNT / SCORE thế nào?")]
    public void Tc0_Probe()
    {
        using var trace = TestTrace.Begin();

        Log("╔══════════════════════════════════════════════════════════════════╗");
        Log("║ PROBE 当日来院回数 — F8 会計 ghi UNPAID.TRT_CNT / SCORE ra gì?   ║");
        Log("╚══════════════════════════════════════════════════════════════════╝");
        Log($"bệnh nhân {PatNo} · màn hình mở ở {TrtDate:yyyy-MM-dd} · " +
            $"年月 「{Screen.YearMonth()}」 · HÔM NAY {DateTime.Today:yyyy-MM-dd}");
        trace.Shot("00-man-hinh-ban-dau");

        ProbePlan();
        ProbeGrid(trace);
        ProbeExistingUnpaid();

        var afterVisit1 = ProbeF8("4", TwoVisitDay.Nm.PlainA, TwoVisitDay.Visit1, trace);
        var afterVisit2 = ProbeF8("5", TwoVisitDay.Nm.Saisin, TwoVisitDay.Visit2, trace);

        ProbeSflg(afterVisit2 ?? afterVisit1);
        ProbeDailyTotal();

        Log("");
        Log("=== KQ-END === Gửi lại: mọi dòng '=== KQ-' + thư mục artifacts\\screenshots");
        Assert.Pass("PROBE xong — đọc các dòng KQ, không có assert nào ở đây");
    }

    // ── KQ-1 ─────────────────────────────────────────────────────────────────

    private void ProbePlan()
    {
        Log("");
        if (_db is null) { Kq("1", $"không đọc được DB ({DbUnavailableReason})"); return; }
        if (_plan is null) { Kq("1", "không dựng được kế hoạch ngày test"); return; }

        foreach (var line in _plan.Describe()) Kq("1", line);
        Kq("1", _plan.Blocker is null
            ? "⇒ ngày test DÙNG ĐƯỢC: hai lượt khám rõ ràng, hai con số điểm khác nhau."
            : "⚠️ KHÔNG DÙNG ĐƯỢC: " + _plan.Blocker);
    }

    // ── KQ-2 ─────────────────────────────────────────────────────────────────

    private void ProbeGrid(TestTrace trace)
    {
        Log("");
        Safe("đọc lưới", () =>
        {
            var rows = _flow.Grid.Snapshot();
            Kq("2", $"lưới đọc được {rows.Count} dòng (UIA chỉ phơi ra dòng ĐANG NHÌN THẤY):");
            foreach (var r in rows) Log("        " + r);

            Kq("2", $"các ngày 日 đọc được trên lưới: [{string.Join(", ", _flow.DaysOnGrid())}]");

            foreach (var nm in new[] { TwoVisitDay.Nm.PlainA, TwoVisitDay.Nm.Saisin, TwoVisitDay.Nm.PlainB })
            {
                var row = TwoVisitDay.RowNamed(_flow, nm);
                Kq("2", row is null
                    ? $"KHÔNG thấy dòng seed 「{nm}」 trên lưới — app đang bám vào phiên cũ " +
                      "(app.attachIfRunning) hay lưới đang cuộn ngoài khung nhìn?"
                    : $"dòng seed 「{nm}」 = {row}");
            }

            // Đặt con trỏ vào dòng nào cho lượt 1: câu trả lời phụ thuộc việc ô 日 có
            // được điền trên MỌI dòng hay chỉ dòng đầu ngày. modSave.cs:2625 điền cho
            // mọi dòng 処置, nhưng CellPainting gộp ô 日 lại (frm203002.cs:1199) nên phải
            // đo xem UIA đọc ra gì.
            var anchor = TwoVisitDay.RowNamed(_flow, TwoVisitDay.Nm.PlainA);
            if (anchor is not null)
            {
                var first = TwoVisitDay.FirstRowOfDay(_flow, TrtDate.Day, anchor);
                Kq("2", first is null
                    ? "không lần ngược được lên dòng ĐẦU của ngày ⇒ ô 日 chỉ có ở dòng đầu, " +
                      "và dòng 「処置A」 sẽ được dùng làm mốc lượt 1."
                    : $"dòng ĐẦU của ngày (mốc lượt 1 nếu cần) = {first}");
            }
            trace.Shot("01-luoi-sau-seed");
        });
    }

    // ── KQ-3 ─────────────────────────────────────────────────────────────────

    private void ProbeExistingUnpaid()
    {
        Log("");
        if (_db is null) return;
        Safe("đọc UNPAID hiện có", () =>
        {
            var rows = _db!.ReadUnpaid(PatNo, null);
            Kq("3", $"UNPAID của bệnh nhân {PatNo} (MỌI ngày) TRƯỚC khi chạy: {rows.Count} dòng");
            foreach (var r in rows) Log("        " + r);
        });
    }

    // ── KQ-4 / KQ-5 ──────────────────────────────────────────────────────────

    /// <summary>Đặt con trỏ vào dòng mang tên đó, bấm F8 đi hết chuỗi, rồi đọc UNPAID.</summary>
    private IReadOnlyList<RaiinCntDb.UnpaidRow>? ProbeF8(
        string kq, string rowName, int expectVisit, TestTrace trace)
    {
        Log("");
        IReadOnlyList<RaiinCntDb.UnpaidRow>? after = null;

        Safe($"F8 ở dòng 「{rowName}」", () =>
        {
            BackToTreatmentScreen();

            var row = TwoVisitDay.RowNamed(_flow, rowName);
            if (row is null)
            {
                Kq(kq, $"lưới không có dòng 「{rowName}」 — không đặt con trỏ được, bỏ bước này.");
                return;
            }

            Kq(kq, $"đặt con trỏ vào {row} — ORACLE nói dòng này thuộc 来院{expectVisit}, " +
                   $"nên UNPAID.TRT_CNT phải ra {expectVisit} và SCORE phải ra " +
                   $"{_plan?.ExpectedScore.GetValueOrDefault(expectVisit)}");
            _flow.FocusRow(row, trace);

            var walk = UnpaidCreationFlow.PressF8AndCreateUnpaid(App, Screen.Window, trace);
            Kq(kq, $"chuỗi hộp thoại ({walk.Trail.Count}); có gặp 「作成してよろしいですか」: {walk.SawCreateUnpaid}");
            for (var i = 0; i < walk.Trail.Count; i++) Log($"        [{i + 1}] {walk.Trail[i]}");
            Log("        chẩn đoán: " + walk.Explain);
            trace.Shot($"f8-{expectVisit}-sau-chuoi");

            _flow.LeaveCounterPaymentIfOpen(trace);
            Thread.Sleep(800);

            if (_db is null) return;
            after = _db.ReadUnpaid(PatNo, TrtDate);
            Kq(kq, $"UNPAID ngày {TrtDate:yyyy-MM-dd} SAU khi F8: {after.Count} dòng");
            foreach (var r in after) Log("        " + r);

            if (after.Count == 0)
            {
                Kq(kq, "KHÔNG có dòng nào ⇒ chuỗi F8 chưa chạy tới bước tạo 未精算. " +
                       "Xem danh sách hộp thoại ở trên để biết nó rẽ đi đâu.");
                return;
            }

            var visits = after.Select(r => r.Visit).Distinct().OrderBy(v => v).ToList();
            Kq(kq, $"来院回数 đọc được: [{string.Join(", ", visits)}] — kỳ vọng có {expectVisit}");

            var ins = after.FirstOrDefault(r => r.Visit == expectVisit && r.Lflg == 0 && r.Score > 0);
            var want = _plan?.ExpectedScore.GetValueOrDefault(expectVisit);
            Kq(kq, ins is null
                ? $"KHÔNG có dòng 医療保険 (lflg=0, score>0) nào mang 来院{expectVisit}"
                : $"dòng 医療保険 của 来院{expectVisit}: score = {ins.Score} / oracle {want} — " +
                  (ins.Score == want ? "KHỚP" : "LỆCH") +
                  $" (điểm CẢ NGÀY là {_plan?.ScoreWholeDay} — ra số đó nghĩa là không lọc theo lượt)");
        });

        return after;
    }

    /// <summary>F8 đóng 診療入力 và mở 窓口精算 (frm203002.cs:7742) — phải lui về trước lượt sau.</summary>
    private void BackToTreatmentScreen()
    {
        _flow.LeaveCounterPaymentIfOpen();
        if (_flow.TreatmentScreenAlive()) return;

        ReopenTreatmentScreen();
        _flow = new AccountingDayFlow(App, Screen);
        Log($"    (đã mở lại 診療入力, 年月 「{Screen.YearMonth()}」)");
    }

    // ── KQ-6 ─────────────────────────────────────────────────────────────────

    private void ProbeSflg(IReadOnlyList<RaiinCntDb.UnpaidRow>? rows)
    {
        Log("");
        if (rows is null || rows.Count == 0) { Kq("6", "không có dòng UNPAID nào để đọc sflg."); return; }

        var distinct = rows.Select(r => r.Sflg).Distinct().ToList();
        Kq("6", $"SFLG của {rows.Count} dòng: [{string.Join(", ", distinct)}] — oracle nói " +
                $"{_plan?.ExpectedSflg}. modAcc.cs:431-459 quét 初診判定 theo NGÀY và break ở dòng " +
                "khớp đầu tiên, KHÔNG lọc 来院回数 ⇒ hai lượt phải ra CÙNG một giá trị.");
        Kq("6", $"ATT_DR: [{string.Join(", ", rows.Select(r => r.AttDr).Distinct())}] " +
                "— WinForm ghi ModCommon.pintDrNo (担当医, modAcc.cs:640).");
    }

    // ── KQ-7 ─────────────────────────────────────────────────────────────────

    private void ProbeDailyTotal()
    {
        Log("");
        Safe("đọc 日計 trên lưới", () =>
        {
            BackToTreatmentScreen();
            var totals = _flow.DailyTotals();
            Kq("7", $"dòng 【日計】 trên lưới ({totals.Count}):");
            foreach (var t in totals) Log("        " + t);

            var mine = totals.FirstOrDefault(t => t.Day == TrtDate.Day);
            Kq("7", mine is null
                ? $"không thấy dòng 日計 của ngày {TrtDate.Day}"
                : $"日計 ngày {TrtDate.Day} = {mine.Point} điểm; tổng ORACLE hai lượt = " +
                  $"{_plan?.ScoreWholeDay} — " +
                  (mine.Point == _plan?.ScoreWholeDay ? "KHỚP" : "LỆCH, xem lại oracle điểm"));
        });
    }
}
