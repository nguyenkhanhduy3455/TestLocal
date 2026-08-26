using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Tests.UnpaidSyosinFlag;

namespace OchaCom.FlaUiTests.Tests.AccountingFocusedDay;

/// <summary>
/// <b>会計対象日 — hai testcase phải ĐỂ F8 GHI mới đo được.</b>
///
/// Nửa còn thiếu của <see cref="AccountingTargetDayTests"/>, cùng số hiệu TC với
/// <c>../web-tenant-tests/tests/accounting-target-date.spec.ts</c>:
///
/// <code>
///   TC-DATE-1  con trỏ ở NGÀY CŨ  → 未精算 rơi vào ĐÚNG ngày đó, không phải ngày màn hình
///   TC-DATE-3  con trỏ ở HÔM NAY  → KHÔNG hỏi 「本日でありません」
/// </code>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÌ SAO PHẢI TÁCH KHỎI <see cref="AccountingTargetDayTests"/>
/// ═══════════════════════════════════════════════════════════════════════════
/// Fixture kia dựng trên đúng một nguyên tắc: <b>chạm cổng ngày rồi DỪNG</b>, nhờ vậy
/// không ghi gì (cổng ngày nằm trước mọi dòng ghi, và <c>modAcc.cs</c> không có
/// transaction). Hai testcase ở đây phá vỡ đúng nguyên tắc đó:
///
/// <list type="bullet">
/// <item><b>TC-DATE-3</b> đo 「cổng ngày IM LẶNG」. Im lặng nghĩa là <c>LetAccData2</c>
///       chạy tiếp — thẳng vào <c>deleteTrtDtUnPaid</c> + insert. Không có cách nào
///       quan sát 「không hỏi」 mà lại chặn được nó đi tiếp.</item>
/// <item><b>TC-DATE-1</b> hỏi 「ngày nào được chọn」. Cổng ngày chỉ nói 「khác hôm nay」
///       chứ không nói NGÀY NÀO. Muốn biết ngày thật thì phải đọc dòng
///       <c>UNPAID</c> mà nó ghi ra — tức phải để nó ghi.</item>
/// </list>
///
/// <para>Bên web hai testcase này chạy vô hại vì <c>page.route</c> CHẶN CỨNG endpoint
/// ghi và trả phản hồi giả. WinForm không có lớp chặn tương đương — app nói chuyện
/// thẳng với SQL Server. Đây là bất đối xứng về KHẢ NĂNG CỦA HAI BỘ TEST, không phải
/// khác biệt hành vi của app.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// SEED ĐỘNG cho 「hôm nay」 — khác hẳn seed cố định 再初診
/// ═══════════════════════════════════════════════════════════════════════════
/// TC-DATE-3 cần một dòng 処置 mang ngày ĐÚNG BẰNG hôm nay. Không thể seed cố định:
/// 「hôm nay」 trôi mỗi ngày, seed hôm nay thì mai đã sai. Nên fixture tự seed ở
/// <c>PrepareDataBeforeApp</c> và <b>tự gỡ</b> ở <c>[OneTimeTearDown]</c>.
///
/// <para>⚠️ Đừng lẫn với seed 再初診 (<c>disp_no</c> 9001/9002) — cái đó CỐ ĐỊNH, nằm
/// trên cả hai DB, và <b>không được gỡ</b> trừ khi có yêu cầu. Fixture này chỉ chạm
/// <c>disp_no</c> riêng của nó.</para>
///
/// <para>Chạy: <c>.\run-accounting-focused-day.ps1</c> (cần <c>parity.allowSave</c>)</para>
/// </summary>
[TestFixture]
[Category("accounting-focused-day")]
public sealed class AccountingTargetDayWriteTests : UiTestBase
{
    /// <summary>Mốc riêng của fixture này — KHÔNG đụng 9001/9002 của seed 再初診.</summary>
    private const int TodaySeedDispNo = 9003;

    private AccountingDayFlow _flow = null!;
    private UnpaidSyosinDb? _db;
    private IReadOnlyList<UnpaidSyosinDb.UnpaidRow>? _unpaidSnapshot;
    private bool _seededToday;

    /// <summary>
    /// Tắt watcher: chuỗi F8 toàn 「…続けますか？」/「…よろしいですか。」 mà với chúng phủ
    /// định = BỎ CUỘC. Watcher bấm 「いいえ」 hộ thì TC-DATE-3 sẽ thấy 「không có hộp thoại
    /// nào」 và XANH SAI — nó không phân biệt được 「app không hỏi」 với 「đã bị trả lời mất」.
    /// </summary>
    protected override string[] NuisanceDialogPatterns => [];

    protected override string? FixturePreflightSkipReason()
    {
        if (!Settings.Parity.AllowSave)
            return "chưa bật parity.allowSave. Hai testcase ở đây BUỘC phải để F8 ghi thật " +
                   "(xem chú thích đầu lớp). Chúng chụp ảnh UNPAID và khôi phục, nhưng đó là " +
                   "đường lui chứ không phải giấy phép — trỏ patient.patNo vào bệnh nhân TEST.";

        if (!Settings.Db.Enabled || string.IsNullOrWhiteSpace(Settings.Db.ConnectionString))
            return "cần db.connectionString để seed dòng hôm nay và đọc UNPAID";

        return null;
    }

    protected override void PrepareDataBeforeApp()
    {
        _db = UnpaidSyosinDb.CreateOrNull(Settings);
        if (_db is null) return;

        _unpaidSnapshot = _db.ReadUnpaid(PatNo);
        TestContext.Out.WriteLine($"ảnh chụp UNPAID: {_unpaidSnapshot.Count} dòng");

        // Chỉ seed khi HÔM NAY nằm trong tháng màn hình sắp mở — lưới chỉ giữ một tháng.
        var today = DateTime.Today;
        if (today.Year != TrtDate.Year || today.Month != TrtDate.Month)
        {
            TestContext.Out.WriteLine(
                $"hôm nay {today:yyyy-MM} khác tháng màn hình {TrtDate:yyyy-MM} — không seed.");
            return;
        }

        if (_db.HasTreatmentOn(PatNo, today))
        {
            TestContext.Out.WriteLine($"bệnh nhân {PatNo} đã có 処置 hôm nay — không cần seed.");
            return;
        }

        var n = _db.SeedSyosinRowOn(PatNo, today, TodaySeedDispNo);
        _seededToday = n > 0;
        TestContext.Out.WriteLine(
            $"SEED ĐỘNG: {n} dòng 処置 cho HÔM NAY {today:yyyy-MM-dd} (disp_no {TodaySeedDispNo}). " +
            "Sẽ tự gỡ ở teardown — 「hôm nay」 trôi mỗi ngày nên không seed cố định được.");
    }

    [OneTimeSetUp]
    public void WriteOneTimeSetUp() => _flow = new AccountingDayFlow(App, Screen);

    [OneTimeTearDown]
    public void CleanUp()
    {
        if (_db is null) return;

        if (_seededToday)
        {
            try
            {
                var removed = _db.RemoveSeed(PatNo, TodaySeedDispNo);
                var left = _db.CountSeedRows(PatNo, TodaySeedDispNo);
                TestContext.Out.WriteLine($"gỡ seed hôm nay: xoá {removed}, còn sót {left}");
                if (left > 0)
                    TestContext.Error.WriteLine(
                        $"!! CÒN SÓT {left} dòng. XOÁ TAY: DELETE FROM TRNTRN " +
                        $"WHERE pat_no = {PatNo} AND disp_no = {TodaySeedDispNo}");
            }
            catch (Exception e)
            {
                TestContext.Error.WriteLine(
                    $"!! KHÔNG GỠ ĐƯỢC seed hôm nay: {e.Message}. XOÁ TAY: DELETE FROM TRNTRN " +
                    $"WHERE pat_no = {PatNo} AND disp_no = {TodaySeedDispNo}");
            }
        }

        if (_unpaidSnapshot is null) return;
        try
        {
            _db.RestoreUnpaid(PatNo, _unpaidSnapshot);
            TestContext.Out.WriteLine(
                $"ĐÃ TRẢ LẠI UNPAID: {_db.ReadUnpaid(PatNo).Count} dòng " +
                $"(ảnh chụp {_unpaidSnapshot.Count})");
        }
        catch (Exception e)
        {
            TestContext.Error.WriteLine($"!! KHÔNG TRẢ LẠI ĐƯỢC UNPAID: {e.Message}");
            foreach (var r in _unpaidSnapshot) TestContext.Error.WriteLine("        " + r);
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

    private UnpaidSyosinDb RequireUnpaidDb()
    {
        if (_db is null) IgnoreWithReason($"không đọc được DB — {DbUnavailableReason}");
        return _db!;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-DATE-1 — ⇔ web TC-DATE-1
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TC-DATE-1 — con trỏ ở NGÀY CŨ: 未精算 rơi vào ĐÚNG ngày đó, không phải ngày màn hình")]
    public void TcDate1_UnpaidLandsOnFocusedRowDay()
    {
        using var trace = TestTrace.Begin();

        var today = DateTime.Today.Day;
        var day = _flow.DaysOnGrid().FirstOrDefault(d => d != today);
        if (day == 0)
            IgnoreWithReason(
                $"lưới không có ngày nào khác hôm nay ({today}) — không dựng được tình huống " +
                "「con trỏ ở ngày khác ngày mở màn hình」.");

        var target = new DateTime(TrtDate.Year, TrtDate.Month, day);
        var screenDate = TrtDate.Date;

        TestContext.Out.WriteLine(
            $"màn hình mở ở {screenDate:yyyy-MM-dd}, con trỏ ở dòng 日 = {day} " +
            $"⇒ 未精算 phải rơi vào {target:yyyy-MM-dd}");

        var row = _flow.RowForDay(day);
        if (row is null) IgnoreWithReason($"không thấy dòng nào 日 = {day}");
        _flow.FocusRow(row!, trace);

        var walk = UnpaidCreationFlow.PressF8AndCreateUnpaid(App, Screen.Window, trace);
        TestContext.Out.WriteLine($"chuỗi hộp thoại ({walk.Trail.Count}):");
        foreach (var s in walk.Trail) TestContext.Out.WriteLine("        " + s);
        _flow.LeaveCounterPaymentIfOpen(trace);
        Thread.Sleep(800);

        var onTarget = RequireUnpaidDb().ReadUnpaid(PatNo, target);
        Assert.That(onTarget, Is.Not.Empty,
            $"F8 không tạo dòng UNPAID nào cho {target:yyyy-MM-dd} — ngày của DÒNG CON TRỎ. " +
            $"Chẩn đoán: {walk.Explain}");

        // Và KHÔNG được rơi vào ngày của màn hình. Đây mới là vế chứng minh: nếu
        // LetAccData2 lấy ngày từ màn hình thì dòng sẽ nằm ở screenDate.
        if (screenDate != target)
        {
            var onScreenDate = RequireUnpaidDb().ReadUnpaid(PatNo, screenDate);
            Assert.That(onScreenDate, Is.Empty,
                $"未精算 rơi vào {screenDate:yyyy-MM-dd} — ngày MỞ MÀN HÌNH — thay vì " +
                $"{target:yyyy-MM-dd} là ngày của dòng con trỏ. Đây đúng triệu chứng tester báo " +
                $"(modAcc.cs:377 dựng ngày từ hFG1[0, intRow]). Dòng lạc: " +
                $"{string.Join(" / ", onScreenDate.Select(r => r.ToString()))}");
        }

        TestContext.Out.WriteLine(
            $"=== KQ-DATE-1 === {onTarget.Count} dòng UNPAID ở {target:yyyy-MM-dd}: " +
            $"{string.Join(" / ", onTarget.Select(r => r.ToString()))}");
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TC-DATE-3 — ⇔ web TC-DATE-3
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(3)]
    [Description("TC-DATE-3 — con trỏ ở dòng HÔM NAY: KHÔNG hỏi 「本日でありません」")]
    public void TcDate3_TodayRowDoesNotAskDateGate()
    {
        using var trace = TestTrace.Begin();

        var today = DateTime.Today;
        var row = _flow.DaysOnGrid().Contains(today.Day) ? _flow.RowForDay(today.Day) : null;
        if (row is null)
            IgnoreWithReason(
                $"lưới chưa có dòng nào của HÔM NAY (ngày {today.Day}). Fixture có seed động " +
                $"nhưng nó chỉ chạy khi hôm nay ({today:yyyy-MM}) cùng tháng với màn hình " +
                $"({TrtDate:yyyy-MM}) — runner tự đặt OCHA_TRT_DT = hôm nay, kiểm lại xem có bị " +
                "ghi đè bằng -TrtDate không.");

        TestContext.Out.WriteLine(
            $"con trỏ ở dòng 日 = {today.Day} (ĐÚNG hôm nay), màn hình mở ở {TrtDate:yyyy-MM-dd}");
        _flow.FocusRow(row!, trace);

        var walk = UnpaidCreationFlow.PressF8AndCreateUnpaid(App, Screen.Window, trace);
        TestContext.Out.WriteLine($"chuỗi hộp thoại ({walk.Trail.Count}):");
        foreach (var s in walk.Trail) TestContext.Out.WriteLine("        " + s);
        _flow.LeaveCounterPaymentIfOpen(trace);
        Thread.Sleep(800);
        trace.Shot("tc-date-3-sau-f8");

        var gate = walk.Trail.Where(s => Txt.Has(s.Text, AccountingDayFlow.NotTodayMsg)).ToList();
        Assert.That(gate, Is.Empty,
            $"con trỏ ở dòng HÔM NAY ({today:yyyy-MM-dd}) mà app vẫn hỏi " +
            $"「{AccountingDayFlow.NotTodayMsg}」 ⇒ modAcc.cs:386 đang so với một ngày KHÁC ngày " +
            $"của dòng con trỏ. Hộp thoại đã gặp: {string.Join(" | ", gate.Select(s => s.Text))}");

        TestContext.Out.WriteLine(
            "=== KQ-DATE-3 === cổng ngày IM LẶNG cho dòng hôm nay. Ghép với TC-DATE-2 " +
            "(dòng ngày cũ ⇒ CÓ hỏi): cùng một màn hình, chỉ đổi dòng con trỏ mà cổng ngày " +
            "đổi kết quả ⇒ 会計対象日 lấy theo DÒNG CON TRỎ.");

        var rows = RequireUnpaidDb().ReadUnpaid(PatNo, today);
        TestContext.Out.WriteLine(
            $"=== KQ-DATE-3 === UNPAID của {today:yyyy-MM-dd}: {rows.Count} dòng " +
            $"{string.Join(" / ", rows.Select(r => r.ToString()))}");
    }
}
