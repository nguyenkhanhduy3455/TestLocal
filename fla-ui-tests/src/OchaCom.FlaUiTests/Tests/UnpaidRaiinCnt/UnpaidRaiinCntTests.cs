using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.AccountingFocusedDay;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;
using OchaCom.FlaUiTests.Tests.UnpaidSyosinFlag;

namespace OchaCom.FlaUiTests.Tests.UnpaidRaiinCnt;

/// <summary>
/// <b>Một ngày HAI lượt khám ⇒ HAI dòng 未精算 riêng, mỗi dòng mang điểm của LƯỢT MÌNH.</b>
///
/// Nửa WinForm của <c>../web-tenant-tests/tests/unpaid-raiin-cnt-parity.spec.ts</c>
/// (ISSUE-14), cùng số hiệu TC. Đây là bên <b>đo đáp án</b> — testcase đỏ nghĩa là
/// WinForm không hành xử như source nói, và khi đó phải sửa hiểu biết trước khi sửa
/// bản port.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// CẢ CHUỖI 会計 BỊ GIỚI HẠN VÀO MỘT LƯỢT KHÁM, KHÔNG PHẢI CẢ NGÀY
/// ═══════════════════════════════════════════════════════════════════════════
/// <code>
/// hfgRaiinCnt();                                              // modAcc.cs:396 — điền cột 71
/// intSelectRaiin = CInt(hFG1[71, hFG1.CurrentCellAddress.Y]); // :415 — DÒNG CON TRỎ
/// GetDayPoint(intRow, …, ref intSelectRaiin, …);              // :416 — 点数 / 一部負担金
/// Calc_DayPoint_Kaigo(con, dtTgtDate, intSelectRaiin, …);     // :419 — 介護
/// Get_AccUnit(con, intRow, lngAccUnit, intSelectRaiin, "9");  // :423 — 14 診療識別
/// UnPaid.deleteTrtDtUnPaid(command, …, intSelectRaiin);       // :428 — xoá 未精算 (trt_cnt % 100)
/// unPaidData.trt_cnt = intSelectRaiin;                        // :632 — dòng 医療保険
/// unPaidData.trt_cnt = intSelectRaiin + 100;                  // :673 — dòng 介護
/// </code>
///
/// <para>Bản port bỏ qua <c>intSelectRaiin</c> ở <b>cả 5 chỗ</b>: <c>InsertUnpaidHandler</c>
/// để <c>trtCnt = 1</c> cứng, <c>BuiPriceCalcInput.VisitsNo = 0</c>,
/// <c>AccUnitCalculator</c> không có tham số 来院回数, <c>UnpaidDayRows.ForDay</c> lọc
/// cứng <c>trt_cnt ∈ {1, 101}</c>. Hệ quả: lượt 2 xoá mềm rồi ghi đè dòng của lượt 1,
/// và mỗi lượt mang điểm của CẢ NGÀY ⇒ 窓口精算 thu sai.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// KHÔNG CÓ CON SỐ NÀO VIẾT CỨNG
/// ═══════════════════════════════════════════════════════════════════════════
/// Điểm kỳ vọng của từng lượt do <see cref="RaiinCntDb.ExpectedScoreByVisit"/> tính lại
/// từ <c>TRNTRN</c> theo đúng ba đoạn source (<c>hfgRaiinCnt</c> → <c>buiPrice</c> →
/// <c>GetDayPoint</c>), nên đổi bệnh nhân / đổi ngày là kỳ vọng tự đổi theo. Đo rồi chép
/// con số vào assert thì testcase chỉ còn so app với chính nó.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ⚠️ GHI DB — hai chỗ, xem <c>README.md</c> cùng thư mục
/// ═══════════════════════════════════════════════════════════════════════════
/// <c>TRNTRN</c> (3 dòng seed, <c>disp_no</c> 9101-9103) và <c>UNPAID</c> của ngày test.
/// Nằm sau <c>parity.allowSave</c>; trỏ <c>patient.patNo</c> vào bệnh nhân TEST.
///
/// <para>Chạy: <c>.\run-unpaid-raiin-cnt.ps1</c> (probe: thêm <c>-Diagnostics</c>)</para>
/// </summary>
[TestFixture]
[Category("unpaid-raiin-cnt")]
public sealed class UnpaidRaiinCntTests : UiTestBase
{
    private AccountingDayFlow _flow = null!;
    private RaiinCntDb? _db;
    private TwoVisitDay.Plan? _plan;
    private IReadOnlyList<RaiinCntDb.UnpaidRow>? _snapshot;

    /// <summary>
    /// Tắt watcher: chuỗi F8 toàn 「…続けますか？」/「…よろしいですか。」/
    /// 「…作成してよろしいですか?」 mà với chúng phủ định = BỎ CUỘC. Watcher bấm 「いいえ」 hộ
    /// sẽ huỷ chuỗi trước khi 未精算 kịp được ghi, và testcase đỏ với 「không có dòng
    /// UNPAID nào」 — đổ oan cho app.
    /// </summary>
    protected override string[] NuisanceDialogPatterns => [];

    protected override string? FixturePreflightSkipReason()
    {
        if (!Settings.Parity.AllowSave)
            return "chưa bật parity.allowSave. Bộ này seed TRNTRN và để F8 chạy TRỌN VẸN nên " +
                   "GHI THẬT vào UNPAID. Nó khôi phục theo ảnh chụp, nhưng đó là đường lui chứ " +
                   "không phải giấy phép — trỏ patient.patNo vào bệnh nhân TEST. " +
                   "Chạy: .\\run-unpaid-raiin-cnt.ps1";

        if (!Settings.Db.Enabled || string.IsNullOrWhiteSpace(Settings.Db.ConnectionString))
            return "cần db.connectionString: trt_cnt/score của UNPAID không hiện trên UI, và " +
                   "ngày 2 lượt khám phải seed thẳng vào TRNTRN";

        return null;
    }

    /// <summary>
    /// Seed TRƯỚC khi app mở — lưới chỉ nạp một lần lúc vào 診療入力, seed sau đó thì
    /// app không thấy và mọi testcase đo trên bộ dòng cũ.
    /// </summary>
    protected override void PrepareDataBeforeApp()
    {
        _db = RaiinCntDb.CreateOrNull(Settings);
        if (_db is null) return;

        _snapshot = _db.ReadUnpaid(PatNo, TrtDate);
        _plan = TwoVisitDay.Build(_db, PatNo, TrtDate);

        TestContext.Out.WriteLine(
            $"ảnh chụp UNPAID ngày {TrtDate:yyyy-MM-dd}: {_snapshot.Count} dòng");
        foreach (var line in _plan.Describe()) TestContext.Out.WriteLine(line);
    }

    [OneTimeSetUp]
    public void RaiinCntOneTimeSetUp() => _flow = new AccountingDayFlow(App, Screen);

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
            TestContext.Out.WriteLine(
                $"ĐÃ TRẢ LẠI UNPAID ngày {TrtDate:yyyy-MM-dd}: " +
                $"{_db.ReadUnpaid(PatNo, TrtDate).Count} dòng (ảnh chụp {_snapshot.Count})");
        }
        catch (Exception e)
        {
            TestContext.Error.WriteLine($"!! KHÔNG TRẢ LẠI ĐƯỢC UNPAID: {e.Message}");
            foreach (var r in _snapshot) TestContext.Error.WriteLine("        " + r);
        }
    }

    /// <summary>F8 đóng 診療入力 và mở 窓口精算 (frm203002.cs:7742-7743) — lui về trước testcase sau.</summary>
    [TearDown]
    public void BackToEntryScreen()
    {
        try
        {
            _flow.LeaveCounterPaymentIfOpen();
            if (_flow.TreatmentScreenAlive()) return;
            ReopenTreatmentScreen();
            _flow = new AccountingDayFlow(App, Screen);
        }
        catch (Exception e) { TestContext.Out.WriteLine($"không mở lại được 診療入力: {e.Message}"); }
    }

    // ─────────────────────────────────────────────────────────────────────────

    private TwoVisitDay.Plan RequirePlan()
    {
        if (_db is null) IgnoreWithReason($"không đọc được DB — {DbUnavailableReason}");
        if (_plan is null) IgnoreWithReason("không dựng được kế hoạch ngày test");
        if (_plan!.Blocker is not null)
            IgnoreWithReason(
                $"ngày {_plan.Date:yyyy-MM-dd} của bệnh nhân {PatNo} không dựng được thành ngày " +
                $"2 lượt khám: {_plan.Blocker}");
        return _plan;
    }

    /// <summary>
    /// Đặt con trỏ vào dòng mang tên đó rồi bấm F8, đi hết chuỗi tới nhánh TẠO 未精算.
    ///
    /// <para>Con trỏ đặt vào dòng <b>seed</b> chứ không vào dòng đầu ngày: cột 71
    /// (来院回数) được <c>hfgRaiinCnt</c> ghi cho TỪNG dòng, và
    /// <c>intSelectRaiin = hFG1[71, CurrentCellAddress.Y]</c> đọc đúng dòng con trỏ
    /// (modAcc.cs:415). Dòng seed có tên riêng nên tìm được mà không phải đếm chỉ số —
    /// UIA chỉ phơi ra dòng đang nhìn thấy nên chỉ số trôi theo vị trí cuộn
    /// (PROBE-GUIDELINE 3.1).</para>
    /// </summary>
    private IReadOnlyList<RaiinCntDb.UnpaidRow> RunF8On(string rowName, TestTrace trace)
    {
        var row = TwoVisitDay.RowNamed(_flow, rowName);
        if (row is null)
            Assert.Fail(
                $"lưới không có dòng 「{rowName}」. Dòng này được seed vào TRNTRN TRƯỚC khi app mở, " +
                $"nên không thấy nghĩa là app đang bám vào một phiên cũ (app.attachIfRunning) hoặc " +
                $"màn hình đang mở ở 年月 khác. 年月 đang mở: 「{Screen.YearMonth()}」. " +
                $"Lưới đọc được: {string.Join(" / ", _flow.Grid.Snapshot().Select(r => r.Ryo.Trim()))}");

        TestContext.Out.WriteLine($"đặt con trỏ vào {row} rồi bấm F8");
        _flow.FocusRow(row!, trace);

        var walk = UnpaidCreationFlow.PressF8AndCreateUnpaid(App, Screen.Window, trace);
        TestContext.Out.WriteLine($"chuỗi hộp thoại ({walk.Trail.Count}):");
        foreach (var s in walk.Trail) TestContext.Out.WriteLine("        " + s);
        TestContext.Out.WriteLine("        chẩn đoán: " + walk.Explain);

        _flow.LeaveCounterPaymentIfOpen(trace);
        Thread.Sleep(800);

        var rows = _db!.ReadUnpaid(PatNo, TrtDate);
        TestContext.Out.WriteLine($"UNPAID ngày {TrtDate:yyyy-MM-dd} sau F8: {rows.Count} dòng");
        foreach (var r in rows) TestContext.Out.WriteLine("        " + r);

        Assert.That(rows, Is.Not.Empty,
            $"F8 ở dòng 「{rowName}」 không để lại dòng 未精算 nào. Chuỗi hộp thoại ở trên cho biết " +
            "nó rẽ đi đâu — thường là bị trả lời 「いいえ」 ở 「…未清算データ…作成してよろしいですか?」.");
        return rows;
    }

    /// <summary>Dòng 未精算 医療保険 của một lượt: <c>lflg = 0</c> và CÓ điểm.</summary>
    /// <remarks>
    /// Nhận bằng <c>score &gt; 0</c> chứ không bằng <c>km_cd</c>: bệnh nhân có
    /// 科目コード = 自費 (50) thì WinForm gộp 自費 vào chính dòng 医療保険
    /// (modAcc.cs:658-665), còn dòng 自費 đứng riêng thì luôn <c>score = 0</c>
    /// (modAcc.cs:706).
    /// </remarks>
    private static RaiinCntDb.UnpaidRow? InsuranceRowOf(
        IReadOnlyList<RaiinCntDb.UnpaidRow> rows, int visit) =>
        rows.FirstOrDefault(r => r.Visit == visit && r.Lflg == 0 && r.Score > 0);

    // ─────────────────────────────────────────────────────────────────────────

    [Test, Order(0)]
    [Description("TC-0 (mốc) — ngày test có ĐÚNG hai lượt khám, và lưới hiện đủ ba dòng seed")]
    public void Tc0_TwoVisitDayIsBuilt()
    {
        var plan = RequirePlan();
        using var trace = TestTrace.Begin();

        // Hai lượt phải mang hai con số KHÁC NHAU, nếu không thì TC-1/TC-2 không phân
        // biệt được 「điểm của lượt」 với 「điểm của cả ngày」 — xanh mà vô nghĩa.
        Assert.That(plan.ScoreVisit1, Is.Not.EqualTo(plan.ScoreVisit2),
            $"hai lượt cùng ra {plan.ScoreVisit1} điểm ⇒ phép đo mất khả năng phân biệt. " +
            "Chọn dòng seed có 点数 khác với 処置 sẵn có của ngày.");
        Assert.That(plan.ScoreVisit1, Is.GreaterThan(0), "lượt 1 không có điểm nào");
        Assert.That(plan.ScoreVisit2, Is.GreaterThan(0), "lượt 2 không có điểm nào");

        // Ba dòng seed phải NHÌN THẤY trên lưới. Không thấy nghĩa là app đang chạy trên
        // bộ dòng cũ, và mọi testcase sau đó đo nhầm dữ liệu.
        foreach (var nm in new[] { TwoVisitDay.Nm.PlainA, TwoVisitDay.Nm.Saisin, TwoVisitDay.Nm.PlainB })
        {
            var row = TwoVisitDay.RowNamed(_flow, nm);
            Assert.That(row, Is.Not.Null,
                $"lưới không hiện dòng seed 「{nm}」 (đã chèn vào TRNTRN trước khi app mở). " +
                $"年月 đang mở 「{Screen.YearMonth()}」; lưới đọc được: " +
                string.Join(" / ", _flow.Grid.Snapshot().Select(r => r.Ryo.Trim())));
        }
        trace.Shot("tc0-luoi-sau-seed");

        // 日計 của app phải khớp tổng ORACLE — nếu lệch thì oracle đang hiểu sai cách
        // WinForm cộng điểm, và mọi con số kỳ vọng sau đó cũng sai theo. Khoá ở đây để
        // TC-1/TC-2 đỏ là đỏ vì 来院回数, không phải vì phép cộng.
        var total = _flow.DailyTotals().FirstOrDefault(t => t.Day == TrtDate.Day);
        Assert.That(total, Is.Not.Null,
            $"lưới không có dòng 【日計】 nào cho ngày {TrtDate.Day} — " +
            $"đọc được: {string.Join(" | ", _flow.DailyTotals())}");
        Assert.That(total!.Point, Is.EqualTo(plan.ScoreWholeDay),
            $"日計 của app = {total.Point} nhưng ORACLE cộng ra {plan.ScoreWholeDay}. " +
            "Oracle = Σ (trt_pt × 回数) trên mọi dòng của ngày (buiPrice.cs:288). Lệch ⇒ " +
            "ngày test có dòng mà oracle chưa tính đúng (自費? 介護? 部位病名行?), sửa oracle trước.");

        TestContext.Out.WriteLine(
            $"ngày {plan.Date:yyyy-MM-dd}: 来院1 = {plan.ScoreVisit1}点, 来院2 = {plan.ScoreVisit2}点, " +
            $"日計 = {total.Point}点");
    }

    // ─────────────────────────────────────────────────────────────────────────

    [Test, Order(1)]
    [Description("TC-1 — F8 từ dòng lượt 1: UNPAID.TRT_CNT = 1 và SCORE chỉ của lượt 1")]
    public void Tc1_AccountingFromFirstVisitRow()
    {
        var plan = RequirePlan();
        using var trace = TestTrace.Begin();

        var rows = RunF8On(TwoVisitDay.Nm.PlainA, trace);

        // Mọi dòng vừa sinh phải thuộc lượt 1 — kể cả dòng 介護 (trt_cnt = 来院回数 + 100,
        // modAcc.cs:673) nên so bằng trt_cnt % 100 (đúng vị từ của deleteTrtDtUnPaid,
        // UnPaid.cs:357).
        foreach (var row in rows)
            Assert.That(row.Visit, Is.EqualTo(TwoVisitDay.Visit1),
                $"con trỏ ở dòng thuộc lượt 1 mà UNPAID.TRT_CNT = {row.TrtCnt} ({row}). " +
                "WinForm ghi thẳng intSelectRaiin = hFG1[71, dòng con trỏ] (modAcc.cs:415/632).");

        var ins = InsuranceRowOf(rows, TwoVisitDay.Visit1);
        Assert.That(ins, Is.Not.Null,
            "không có dòng 未精算 nào mang 点数 (lflg = 0, score > 0) — " +
            $"đọc được: {string.Join(" | ", rows)}");
        Assert.That(ins!.Score, Is.EqualTo(plan.ScoreVisit1),
            $"UNPAID.SCORE = {ins.Score}, cần {plan.ScoreVisit1} (điểm của RIÊNG lượt 1). " +
            $"Ra {plan.ScoreWholeDay} nghĩa là vẫn cộng CẢ NGÀY — tức GetDayPoint " +
            "(modAcc.cs:238) / Get_AccUnit (modAcc.cs:821) không lọc theo 来院回数.");
    }

    // ─────────────────────────────────────────────────────────────────────────

    [Test, Order(2)]
    [Description("TC-2 — F8 từ dòng lượt 2: sinh dòng TRT_CNT = 2 và KHÔNG xoá dòng lượt 1")]
    public void Tc2_AccountingFromSecondVisitRowKeepsFirst()
    {
        var plan = RequirePlan();
        using var trace = TestTrace.Begin();

        var rows = RunF8On(TwoVisitDay.Nm.Saisin, trace);

        var visit1 = rows.Where(r => r.Visit == TwoVisitDay.Visit1).ToList();
        var visit2 = rows.Where(r => r.Visit == TwoVisitDay.Visit2).ToList();

        // ĐÂY là vế chính: deleteTrtDtUnPaid lọc `trt_cnt % 100 = @trt_cnt` (UnPaid.cs:357)
        // nên kế toán lượt 2 KHÔNG được đụng vào dòng của lượt 1.
        Assert.That(visit1, Is.Not.Empty,
            "dòng 未精算 của LƯỢT 1 biến mất sau khi kế toán lượt 2. Bản dùng trt_cnt = 1 cứng " +
            "cho cả hai lượt sẽ xoá mềm dòng cũ rồi ghi đè — đúng triệu chứng của ISSUE-14. " +
            $"Đọc được: {string.Join(" | ", rows)}");
        Assert.That(visit2, Is.Not.Empty,
            $"không có dòng 未精算 nào mang 来院回数 = {TwoVisitDay.Visit2}. " +
            $"Đọc được TRT_CNT: [{string.Join(", ", rows.Select(r => r.TrtCnt))}]");

        var ins2 = InsuranceRowOf(rows, TwoVisitDay.Visit2);
        Assert.That(ins2, Is.Not.Null, "lượt 2 không có dòng 未精算 nào mang 点数");
        Assert.That(ins2!.Score, Is.EqualTo(plan.ScoreVisit2),
            $"lượt 2: UNPAID.SCORE = {ins2.Score}, cần {plan.ScoreVisit2}. " +
            $"Ra {plan.ScoreWholeDay} nghĩa là mỗi lượt vẫn mang điểm của CẢ NGÀY.");

        var ins1 = InsuranceRowOf(rows, TwoVisitDay.Visit1);
        Assert.That(ins1, Is.Not.Null, "lượt 1 không còn dòng 未精算 nào mang 点数");
        Assert.That(ins1!.Score, Is.EqualTo(plan.ScoreVisit1),
            "kế toán lượt 2 KHÔNG được sửa số của lượt 1");

        // Tổng hai lượt = 日計 của ngày: modAcc.DispDayPoint (modAcc.cs:132-212) cộng CẢ
        // NGÀY, nên thiếu nghĩa là có dòng bị bỏ sót khỏi cả hai lượt.
        Assert.That(ins1.Score + ins2.Score, Is.EqualTo(plan.ScoreWholeDay),
            $"tổng điểm hai lượt ({ins1.Score} + {ins2.Score}) phải bằng 日計 " +
            $"{plan.ScoreWholeDay} của ngày");
    }

    // ─────────────────────────────────────────────────────────────────────────

    [Test, Order(3)]
    [Description("TC-3 — SFLG giống nhau ở cả hai lượt: 初診判定 quét theo NGÀY, không theo lượt")]
    public void Tc3_SyosinFlagIsPerDayNotPerVisit()
    {
        var plan = RequirePlan();

        // Không bấm F8 thêm lần nào — đọc lại chính những dòng TC-1/TC-2 vừa tạo.
        var rows = _db!.ReadUnpaid(PatNo, TrtDate);
        Assert.That(rows, Is.Not.Empty,
            "không còn dòng 未精算 nào của ngày test — TC-1/TC-2 chưa tạo được gì");

        var visits = rows.Select(r => r.Visit).Distinct().OrderBy(v => v).ToList();
        Assert.That(visits, Does.Contain(TwoVisitDay.Visit1).And.Contain(TwoVisitDay.Visit2),
            $"cần dòng của CẢ HAI lượt mới so được sflg; đang có [{string.Join(", ", visits)}]");

        // modAcc.cs:431-459 so `grdRegi[0,i] == grdRegi[0,intRow]` — chỉ NGÀY — và break
        // ngay ở dòng khớp đầu tiên. Không có bộ lọc 来院回数 nào.
        var distinct = rows.Select(r => r.Sflg).Distinct().ToList();
        Assert.That(distinct, Has.Count.EqualTo(1),
            $"UNPAID.SFLG khác nhau giữa các lượt ({string.Join(", ", rows.Select(r => $"来院{r.Visit}:{r.Sflg}"))}). " +
            "初診/再診/再初診 判定 của modAcc quét theo NGÀY, KHÔNG lọc 来院回数 (modAcc.cs:433) — " +
            "ai thêm bộ lọc 来院回数 vào nhánh này là TC-3 đỏ.");

        Assert.That(distinct[0], Is.EqualTo(plan.ExpectedSflg),
            $"SFLG = {distinct[0]} nhưng ORACLE nói {plan.ExpectedSflg} " +
            $"(ngày có 初診: {plan.RowsAfter.Any(v => v.Row.TrtCd == 100)}; " +
            $"số 初診 trước đầu tháng: {plan.PastSyosinCount} — 0 ⇒ 1, >0 ⇒ 3, không 初診 ⇒ 2; " +
            "modAcc.cs:465-476 + Trntrn.cs:1274).");
    }
}
