using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.AccountingFocusedDay;

namespace OchaCom.FlaUiTests.Tests.UnpaidSyosinFlag;

/// <summary>
/// <b><c>UNPAID.SFLG</c> phải theo bảng mã của <c>modAcc</c>: 1=初診 / 2=再診 / 3=再初診.</b>
///
/// Nửa WinForm của <c>../web-tenant-tests/tests/unpaid-syosin-flg.spec.ts</c>, cùng số
/// hiệu TC. Đây là bên <b>đo đáp án</b> — testcase đỏ nghĩa là bản port lệch.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÌ SAO PHẢI SOI DB
/// ═══════════════════════════════════════════════════════════════════════════
/// <c>sflg</c> KHÔNG hiện ở bất kỳ đâu trên màn hình — chính tester cũng phải mở bảng
/// <c>UNPAID</c> mới thấy. Không có đường nào đo qua UI, nên fixture chạy F8 THẬT rồi
/// đọc <c>UNPAID</c>.
///
/// <para>⚠️ <b>CÓ GHI DB.</b> Mỗi lượt F8 chạy <c>deleteTrtDtUnPaid</c> rồi chèn lại, và
/// <c>modAcc.cs</c> không có transaction. Fixture chụp ảnh <c>UNPAID</c> của bệnh nhân ở
/// <c>PrepareDataBeforeApp</c> và khôi phục ở <c>[OneTimeTearDown]</c>. Nằm sau
/// <c>parity.allowSave</c>.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// TIỀN ĐỀ: dữ liệu seed 再初診 — CỐ ĐỊNH, fixture KHÔNG tự tạo và KHÔNG tự gỡ
/// ═══════════════════════════════════════════════════════════════════════════
/// <c>sflg = 3</c> đòi ngày đang xét CÓ 初診 <b>và</b> bệnh nhân đã từng 初診 TRƯỚC
/// tháng. Dữ liệu gốc không bệnh nhân nào thoả, nên tiền đề được seed một lần vào
/// <b>CẢ HAI DB</b> (SQL Server <c>TRNTRN</c> + Postgres <c>trn_trn</c>): pat_no 10,
/// trt_dt 2026-07-20, <c>disp_no = 9001</c>. Xem README mục 4.
///
/// <para>Seed cũng làm cho <b>TC-SFLG-2 có nghĩa</b>: nó khẳng định ngày chỉ có 再診 ra
/// 2 <b>kể cả khi quá khứ đã có 初診</b> — không có seed thì quá khứ trống và testcase
/// không phân biệt được 「đúng luật」 với 「may mà quá khứ rỗng」.</para>
///
/// <para>Chạy: <c>.\run-unpaid-syosin-flag.ps1</c></para>
/// </summary>
[TestFixture]
[Category("unpaid-syosin-flag")]
public sealed class UnpaidSyosinFlagTests : UiTestBase
{
    /// <summary>Mã 訪問診療 của <c>buiPrice</c> — WinForm KHÔNG BAO GIỜ ghi vào UNPAID.</summary>
    private const int BuiPriceHomeVisitFlg = 4;

    private AccountingDayFlow _flow = null!;
    private UnpaidSyosinDb? _db;
    private IReadOnlyList<UnpaidSyosinDb.UnpaidRow>? _snapshot;

    /// <summary>
    /// Tắt watcher: chuỗi F8 toàn 「…続けますか？」/「…よろしいですか。」 mà với chúng phủ
    /// định = BỎ CUỘC. Watcher bấm 「いいえ」 hộ sẽ huỷ chuỗi trước khi 未精算 kịp được
    /// ghi, và testcase sẽ đỏ với 「không có dòng UNPAID nào」 — đổ oan cho app.
    /// </summary>
    protected override string[] NuisanceDialogPatterns => [];

    protected override string? FixturePreflightSkipReason()
    {
        if (!Settings.Parity.AllowSave)
            return "chưa bật parity.allowSave. Bộ này để F8 chạy TRỌN VẸN nên GHI THẬT vào " +
                   "UNPAID. Nó khôi phục theo ảnh chụp, nhưng đó là đường lui chứ không phải " +
                   "giấy phép — trỏ patient.patNo vào bệnh nhân TEST. " +
                   "Chạy: .\\run-unpaid-syosin-flag.ps1";

        if (!Settings.Db.Enabled || string.IsNullOrWhiteSpace(Settings.Db.ConnectionString))
            return "cần db.connectionString: sflg không hiện trên UI, chỉ đọc được từ DB";

        return null;
    }

    protected override void PrepareDataBeforeApp()
    {
        _db = UnpaidSyosinDb.CreateOrNull(Settings);
        _snapshot = _db?.ReadUnpaid(PatNo);
        TestContext.Out.WriteLine(
            $"ảnh chụp UNPAID của bệnh nhân {PatNo}: {_snapshot?.Count.ToString() ?? "(không đọc được)"} dòng");
    }

    [OneTimeSetUp]
    public void FlagOneTimeSetUp() => _flow = new AccountingDayFlow(App, Screen);

    /// <summary>Trả UNPAID về nguyên trạng. KHÔNG đụng dòng seed — seed nằm ở TRNTRN.</summary>
    [OneTimeTearDown]
    public void RestoreUnpaid()
    {
        if (_db is null || _snapshot is null) return;
        try
        {
            _db.RestoreUnpaid(PatNo, _snapshot);
            TestContext.Out.WriteLine(
                $"ĐÃ TRẢ LẠI UNPAID: {_db.ReadUnpaid(PatNo).Count} dòng (ảnh chụp {_snapshot.Count})");
        }
        catch (Exception e)
        {
            TestContext.Error.WriteLine($"!! KHÔNG TRẢ LẠI ĐƯỢC UNPAID: {e.Message}");
            foreach (var r in _snapshot) TestContext.Error.WriteLine("        " + r);
        }
    }

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

    private UnpaidSyosinDb RequireDbOrIgnore()
    {
        if (_db is null) IgnoreWithReason($"không đọc được DB — {DbUnavailableReason}");
        return _db!;
    }

    /// <summary>
    /// Chạy F8 trên một ngày rồi trả về các dòng UNPAID của ngày đó.
    ///
    /// <para>Đi qua <see cref="UnpaidCreationFlow"/> — bộ luật trả lời <b>はい</b> cho
    /// 「…未清算データ…作成してよろしいですか?」. Dùng <c>AccountingFlow.WalkToChgAccData</c>
    /// thì nó trả lời 「いいえ」 và không có dòng nào được ghi.</para>
    /// </summary>
    private IReadOnlyList<UnpaidSyosinDb.UnpaidRow> RunF8On(
        UnpaidSyosinDb.DayOracle day, TestTrace trace)
    {
        var row = _flow.RowForDay(day.Day);
        if (row is null)
            IgnoreWithReason(
                $"lưới không có dòng nào 日 = {day.Day}. 年月 đang mở: 「{Screen.YearMonth()}」");

        TestContext.Out.WriteLine(
            $"đặt con trỏ vào dòng 日 = {day.Day} ({day.Date:yyyy-MM-dd}) rồi bấm F8");
        _flow.FocusRow(row!, trace);

        var walk = UnpaidCreationFlow.PressF8AndCreateUnpaid(App, Screen.Window, trace);
        TestContext.Out.WriteLine($"chuỗi hộp thoại ({walk.Trail.Count}):");
        foreach (var s in walk.Trail) TestContext.Out.WriteLine("        " + s);

        _flow.LeaveCounterPaymentIfOpen(trace);
        Thread.Sleep(800);
        trace.Shot($"sau-f8-ngay-{day.Day}");

        var rows = RequireDbOrIgnore().ReadUnpaid(PatNo, day.Date);
        Assert.That(rows, Is.Not.Empty,
            $"F8 trên {day.Date:yyyy-MM-dd} không tạo dòng UNPAID nào ⇒ chưa đo được sflg. " +
            $"Chuỗi hộp thoại: {string.Join(" | ", walk.Trail.Select(s => s.Text))}. " +
            $"Chẩn đoán: {walk.Explain}");
        return rows;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-SFLG-1 — ⇔ web TC-SFLG-1
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TC-SFLG-1 — ngày có 初診: sflg = 1 hoặc 3 theo quá khứ, KHÔNG BAO GIỜ 2")]
    public void TcSflg1_FirstVisitDayIsOneOrThree()
    {
        using var trace = TestTrace.Begin();

        var all = RequireDbOrIgnore().DayOracles(PatNo, TrtDate);
        foreach (var o in all) TestContext.Out.WriteLine("        " + o);

        // Tiêu chí CHỌN NGÀY chép nguyên từ spec web để hai bên tự chọn CÙNG một ngày.
        var day = all.FirstOrDefault(o => o.UsableAsFirstVisitCase);
        if (day is null)
            IgnoreWithReason(
                $"tháng {TrtDate:yyyy-MM} của bệnh nhân {PatNo} không có ngày nào CHỈ có 初診 " +
                "và CHƯA quyết toán. Ngày vừa có 初診 vừa có 再診 thì kết quả phụ thuộc luật " +
                "「hit đầu tiên thắng」 (biến khác), còn ngày đã 会計済 thì bung hộp 既存会計 và " +
                "đụng dữ liệu đã chốt — spec web cũng bỏ qua hai loại đó. Xem bảng ngày ở trên.");

        TestContext.Out.WriteLine($"ORACLE: {day}");
        var rows = RunF8On(day!, trace);

        Assert.Multiple(() =>
        {
            foreach (var r in rows)
            {
                Assert.That(r.Sflg, Is.Not.EqualTo(UnpaidSyosinDb.SyosinRevisit),
                    $"ngày CÓ 初診 mà ghi sflg = 2 (再診). {r} — đây đúng triệu chứng tester " +
                    "báo, và là dấu hiệu sflg đang lấy từ buiPrice thay vì modAcc.");

                Assert.That(r.Sflg, Is.EqualTo(day!.ExpectedSflg),
                    $"{r} — oracle nói {day.ExpectedSflg} vì {day.Why} " +
                    $"(modAcc.cs:465-476 + getKaikeiPastSyosinCnt, Trntrn.cs:1274).");
            }
        });

        TestContext.Out.WriteLine(
            $"=== KQ-SFLG-1 === {rows.Count} dòng, sflg = " +
            $"[{string.Join(", ", rows.Select(r => r.Sflg))}] / oracle {day!.ExpectedSflg}");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-SFLG-2 — ⇔ web TC-SFLG-2
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(2)]
    [Description("TC-SFLG-2 — ngày chỉ có 再診: sflg = 2 kể cả khi quá khứ đã có 初診")]
    public void TcSflg2_RevisitDayIsAlwaysTwo()
    {
        using var trace = TestTrace.Begin();

        var all = RequireDbOrIgnore().DayOracles(PatNo, TrtDate);
        foreach (var o in all) TestContext.Out.WriteLine("        " + o);

        var day = all.FirstOrDefault(o => o.UsableAsRevisitCase);
        if (day is null)
            IgnoreWithReason(
                $"tháng {TrtDate:yyyy-MM} không có ngày nào CHỈ có 再診, không có 文言 初診扱い, " +
                "và chưa quyết toán. Xem bảng ngày ở trên.");

        // Sức chứng minh của testcase này nằm ở chỗ quá khứ ĐÃ CÓ 初診: khi đó một bản
        // port lẫn hai điều kiện (dùng 「quá khứ có 初診」 để quyết định thay vì để phân
        // biệt 1 với 3) sẽ ghi nhầm 3. Quá khứ rỗng thì không phân biệt được.
        TestContext.Out.WriteLine($"ORACLE: {day}");
        if (day!.PastSyosinCount == 0)
            TestContext.Out.WriteLine(
                "CẢNH BÁO — quá khứ KHÔNG có 初診 nào, nên testcase này chỉ kiểm 「ra 2」 chứ " +
                "chưa phân biệt được với bản port lẫn điều kiện. Cần dữ liệu seed 再初診 " +
                "(README mục 4).");

        var rows = RunF8On(day, trace);

        Assert.Multiple(() =>
        {
            foreach (var r in rows)
                Assert.That(r.Sflg, Is.EqualTo(UnpaidSyosinDb.SyosinRevisit),
                    $"ngày KHÔNG có 初診 thì luôn là 2 (modAcc.cs:475), bất kể quá khứ có " +
                    $"{day.PastSyosinCount} dòng 初診. {r}");
        });

        TestContext.Out.WriteLine(
            $"=== KQ-SFLG-2 === {rows.Count} dòng, sflg = " +
            $"[{string.Join(", ", rows.Select(r => r.Sflg))}]; quá khứ có {day.PastSyosinCount} 初診");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-SFLG-3 — ⇔ web TC-SFLG-3
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(3)]
    [Description("TC-SFLG-3 — mọi dòng vừa ghi chỉ mang 1/2/3, không có mã 4 của buiPrice")]
    public void TcSflg3_NeverWritesBuiPriceCodeFour()
    {
        using var trace = TestTrace.Begin();
        _ = trace;

        // Không chạy F8 lại — đọc MỌI dòng UNPAID mà hai testcase trên vừa ghi.
        var rows = RequireDbOrIgnore().ReadUnpaid(PatNo);
        if (rows.Count == 0)
            IgnoreWithReason(
                "chưa có dòng UNPAID nào để kiểm — TC-SFLG-1/2 phải chạy trước (fixture này " +
                "nối tiếp nhau, đừng lọc một testcase lẻ).");

        var bad = rows.Where(r => r.Sflg is not (UnpaidSyosinDb.SyosinFirstVisit
                                              or UnpaidSyosinDb.SyosinRevisit
                                              or UnpaidSyosinDb.SyosinReFirstVisit)).ToList();

        Assert.That(bad, Is.Empty,
            $"UNPAID.SFLG chỉ được mang 1/2/3 (modAcc.cs:465-476). Dòng lạ: " +
            $"{string.Join(" / ", bad.Select(r => r.ToString()))}. Riêng giá trị " +
            $"{BuiPriceHomeVisitFlg} là mã 訪問診療 của buiPrice — thấy nó nghĩa là sflg đang " +
            "lấy từ buiPrice.SetSyosinFlags thay vì modAcc, và modAcc còn ghi đè ngược lên " +
            "buiPrice (modAcc.cs:549) nên giá trị đó không thể tới UNPAID.");

        TestContext.Out.WriteLine(
            $"=== KQ-SFLG-3 === {rows.Count} dòng, các giá trị sflg = " +
            $"[{string.Join(", ", rows.Select(r => r.Sflg).Distinct().OrderBy(v => v))}]");
        TestContext.Out.WriteLine(
            $"=== KQ-SFLG-3 === ATT_DR = [{string.Join(", ", rows.Select(r => r.AttDr).Distinct())}] " +
            "— WinForm ghi ModCommon.pintDrNo (担当医, modAcc.cs:640). Con số để đối chiếu với " +
            "bản web (báo cáo nói InsertUnpaidHandler đang hardcode 0).");
    }
}
