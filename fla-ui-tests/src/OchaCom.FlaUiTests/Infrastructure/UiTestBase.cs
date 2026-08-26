using NUnit.Framework;
using NUnit.Framework.Interfaces;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Data;
using OchaCom.FlaUiTests.Screens;

namespace OchaCom.FlaUiTests.Infrastructure;

/// <summary>
/// Nền chung cho mọi fixture chạy trên giao diện.
///
/// ─── MỘT phiên app cho cả fixture ───────────────────────────────────────────
/// <c>OneTimeSetUp</c> mở app + đi tới 診療入力 đúng MỘT lần, mọi testcase trong fixture
/// dùng chung cửa sổ đó. Giống <c>mode: 'serial'</c> + <c>beforeAll</c> của bộ Playwright:
/// khởi động app này mất hàng chục giây và chạm DB, mở lại cho từng testcase là quá đắt.
///
/// Hệ quả phải biết: các testcase KHÔNG độc lập với nhau. Testcase trước để lại gì trong
/// 3 ô 検索 thì testcase sau thấy nguyên như vậy — nên mỗi testcase tự dọn ô trước khi
/// làm việc của mình. Và khi <c>run.stopOnFirstFailure</c> bật (mặc định), testcase đầu
/// tiên đỏ sẽ làm mọi testcase SAU nó bị Ignore, y như serial của Playwright: chạy tiếp
/// trên một màn hình đã lệch trạng thái chỉ sinh ra lỗi giả.
///
/// ─── Ảnh màn hình ───────────────────────────────────────────────────────────
/// <c>TearDown</c> chụp TOÀN MÀN HÌNH sau MỖI testcase (cả xanh lẫn đỏ) và đính vào báo
/// cáo NUnit. Testcase đỏ còn được đổ thêm cây UIA ra file — thứ luôn thiếu khi debug
/// automation trên máy khác.
/// </summary>
[TestFixture]
[NonParallelizable]
[Apartment(ApartmentState.STA)]
public abstract class UiTestBase
{
    protected TestSettings Settings { get; private set; } = null!;
    protected OchaApp App { get; private set; } = null!;
    protected TreatmentEntryScreen Screen { get; private set; } = null!;

    /// <summary>Null khi tắt DB hoặc không kết nối được (lý do nằm ở <see cref="DbUnavailableReason"/>).</summary>
    protected OchaDb? Db { get; private set; }

    protected string? DbUnavailableReason { get; private set; }

    /// <summary>Ngày test — mặc định hôm nay, xem <c>patient.trtDate</c>.</summary>
    protected DateTime TrtDate => Settings.Patient.ResolvedTrtDate;

    protected int PatNo => int.Parse(Settings.Patient.PatNo);

    private NuisanceDialogWatcher? _watcher;
    private bool _aborted;
    private int _testIndex;

    /// <summary>
    /// Fixture tự loại mình TRƯỚC khi app được mở.
    ///
    /// <para>Trả về lý do ⇒ bỏ qua cả fixture ngay lập tức. Trả null ⇒ chạy bình thường.</para>
    ///
    /// <para>Vì sao cần: <c>Assert.Ignore</c> đặt trong <c>[SetUp]</c> chạy SAU
    /// <c>OneTimeSetUp</c> này, tức là app đã kịp khởi động và điều hướng tới 診療入力 —
    /// mất hàng chục giây cho một fixture rốt cuộc không chạy testcase nào. Bộ parity
    /// hay rơi vào cảnh đó (chưa bật <c>parity.allowSave</c>), nên nó chặn ở đây.</para>
    /// </summary>
    protected virtual string? FixturePreflightSkipReason() => null;

    /// <summary>
    /// Mẫu hộp thoại mà <see cref="NuisanceDialogWatcher"/> tự bấm 「いいえ」. Mặc định
    /// lấy nguyên <c>run.nuisanceDialogs</c>.
    ///
    /// <para>Fixture nào ĐANG ĐO CHÍNH một câu hỏi nằm trong danh sách đó <b>phải</b>
    /// override — mặc định có sẵn 「を算定しますか？」 và 「加算を算定しますか」, tức là
    /// watcher sẽ trả lời 「いいえ」 hộ trước khi testcase kịp nhìn thấy hộp thoại. Khi
    /// đó testcase không đỏ mà <b>xanh sai</b>: nó kết luận 「app không hỏi」 trong khi
    /// app có hỏi và đã bị trả lời mất.</para>
    /// </summary>
    protected virtual string[] NuisanceDialogPatterns => Settings.Run.NuisanceDialogs;

    /// <summary>
    /// Sửa dữ liệu TRƯỚC khi app được mở và trước khi điều hướng tới 診療入力.
    ///
    /// <para>Cần cho những cột mà app chỉ đọc MỘT LẦN rồi giữ trong bộ nhớ suốt phiên.
    /// Rõ nhất là <c>insurance.dis_flg</c>: <c>CommonInp.getCommonPatInfo</c> nạp
    /// <c>_patInfoList</c> ở màn CHỌN BỆNH NHÂN (frm203001.cs:739), và từ đó
    /// <c>getPatInfo()</c> chỉ đọc lại mảng trong RAM (CommonInp.cs:160-172). Vá DB khi
    /// frm203002 đã mở thì app không bao giờ thấy — testcase đỏ mà log trông y hệt
    /// 「WinForm không hỏi」.</para>
    ///
    /// <para>Chạy sau <see cref="FixturePreflightSkipReason"/> (fixture bị bỏ qua thì
    /// không đụng dữ liệu) và trước <c>OchaApp.LaunchOrAttach</c>. Fixture nào override
    /// thì phải tự trả lại nguyên trạng ở <c>[OneTimeTearDown]</c> của chính nó.</para>
    /// </summary>
    protected virtual void PrepareDataBeforeApp() { }

    [OneTimeSetUp]
    public void UiTestBaseOneTimeSetUp()
    {
        Settings = TestSettings.Current;

        if (FixturePreflightSkipReason() is { } skip)
        {
            TestContext.Out.WriteLine("IGNORE (cả fixture, chưa mở app) — " + skip);
            Assert.Ignore(skip);
        }

        ScreenCapture.EnableDpiAwareness();

        PrepareDataBeforeApp();

        Db = OchaDb.CreateOrNull(Settings);
        if (Db is null)
        {
            DbUnavailableReason =
                "db.enabled = false hoặc thiếu db.connectionString trong testsettings(.local).json";
        }
        else
        {
            var error = Db.ProbeError();
            if (error is not null)
            {
                DbUnavailableReason = $"không kết nối được SQL Server: {error}";
                Db = null;
            }
        }

        App = OchaApp.LaunchOrAttach(Settings);

        var nuisance = NuisanceDialogPatterns;
        if (nuisance.Length < Settings.Run.NuisanceDialogs.Length)
            TestContext.Out.WriteLine(
                $"NuisanceDialogWatcher: fixture thu hep tu {Settings.Run.NuisanceDialogs.Length} " +
                $"xuong {nuisance.Length} mau — cac hop thoai con lai fixture tu tra loi.");

        _watcher = new NuisanceDialogWatcher(App.ProcessId,
                                             nuisance,
                                             Settings.Run.NuisanceDialogButtons);
        _watcher.Start();

        var window = AppNavigator.OpenTreatmentEntry(App, Settings);
        Screen = new TreatmentEntryScreen(window, App.Automation);
        Screen.WaitUntilReady();
        WaitUntilAppResponsive();

        TestContext.Out.WriteLine($"診療入力 đã mở: 患者番号={Screen.PatientNo()} 年月={Screen.YearMonth()} " +
                                  $"(ngày test {TrtDate:yyyy-MM-dd})");
        if (DbUnavailableReason is not null)
            TestContext.Out.WriteLine($"CẢNH BÁO — DB không dùng được: {DbUnavailableReason}");
    }

    [SetUp]
    public void UiTestBaseSetUp()
    {
        _testIndex++;
        if (_aborted && Settings.Run.StopOnFirstFailure)
        {
            Assert.Ignore(
                "Bỏ qua vì một testcase TRƯỚC trong fixture đã đỏ (run.stopOnFirstFailure). " +
                "Cả fixture dùng chung một phiên app, chạy tiếp trên trạng thái đã lệch chỉ sinh lỗi giả.");
        }
    }

    [TearDown]
    public void UiTestBaseTearDown()
    {
        var ctx = TestContext.CurrentContext;
        var status = ctx.Result.Outcome.Status;
        var failed = status == TestStatus.Failed;
        var passed = status == TestStatus.Passed;

        // Timeout của NUnit vào nhánh Failed + stacktrace chứa "Test exceeded".
        // Nhận ra từ stacktrace thay vì flag riêng — NUnit không có TestStatus.Timeout.
        var timedOut = failed && ContainsIgnoreCase(ctx.Result.Message, "exceeded") ||
                       failed && ContainsIgnoreCase(ctx.Result.StackTrace, "TestAdapter")
                                && ContainsIgnoreCase(ctx.Result.StackTrace, "Timeout");

        if (failed) _aborted = true;

        if (_watcher is { } w && w.Dismissed.Count > 0)
            TestContext.Out.WriteLine("Hộp thoại đã tự đóng: " + string.Join(" / ", w.Dismissed));

        var shouldCapture = failed ? Settings.Run.CaptureOnFail : Settings.Run.CaptureOnPass;
        if (shouldCapture)
        {
            var name = $"{_testIndex:00}_{ShortName(ctx.Test.Name)}_{status}_{DateTime.Now:HHmmss}";
            try
            {
                var path = ScreenCapture.CaptureToFile(ScreenshotDirectory(), name);
                TestContext.AddTestAttachment(path, $"Toàn màn hình sau 「{ctx.Test.Name}」 ({status})");
            }
            catch (Exception e)
            {
                TestContext.Out.WriteLine($"Không chụp được màn hình: {e.Message}");
            }
        }

        if (failed)
        {
            // Đỏ thì đổ thêm cây UIA — không có nó thì lỗi "không tìm thấy control"
            // trên máy người khác là ngõ cụt.
            try
            {
                var dumpPath = Path.Combine(
                    ScreenshotDirectory(),
                    $"{_testIndex:00}_{ShortName(ctx.Test.Name)}_{status}_{DateTime.Now:HHmmss}.uia.txt");
                File.WriteAllText(dumpPath, Uia.DumpTree(Screen.Window));
            }
            catch (Exception e)
            {
                TestContext.Out.WriteLine($"Không đổ được cây UIA: {e.Message}");
            }
        }

        // Kill app ngay trong TearDown nếu cờ tương ứng bật. Bám vào app đang
        // chạy thì App.ForceKill() tự no-op.
        //
        //   killOnFail    — testcase lỗi (Failed)           : tránh để app ở trạng
        //                   thái lệch chờ thao tác thật
        //   killOnTimeout — testcase vượt quá testTimeout   : timeout thường nghĩa
        //                   là app đang treo không phản hồi
        //   killOnSuccess — testcase xanh (Passed)          : cho kết thúc ngay
        //                   khi chạy nhiều fixture liên tiếp / CI
        var wantKill =
            (failed && !timedOut && Settings.Run.KillOnFail) ||
            (timedOut && Settings.Run.KillOnTimeout) ||
            (passed && Settings.Run.KillOnSuccess);

        if (wantKill)
        {
            var reason = timedOut ? "TIMEOUT" : passed ? "PASSED" : "FAILED";
            var flag = timedOut ? "killOnTimeout" : passed ? "killOnSuccess" : "killOnFail";
            TestContext.Out.WriteLine($"KILL APP — trạng thái {reason}, cờ run.{flag} đang bật.");
            try
            {
                App.ForceKill();
                App.Dispose();
            }
            catch (Exception e)
            {
                TestContext.Out.WriteLine($"Không kill được app: {e.Message}");
            }
        }
    }

    private static bool ContainsIgnoreCase(string? s, string needle) =>
        s is { Length: > 0 } && s.Contains(needle, StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Mở lại màn 診療入力 sau khi nó bị đóng.
    ///
    /// <para>Chỉ bộ test parity cần: F9 登録 thành công thì <c>SaveChangesAndExit</c> trả
    /// 「終了」 và app đóng frm203002, nên testcase sau không còn cửa sổ để thao tác.
    /// Các fixture khác không bấm F9 nên không bao giờ gọi tới đây.</para>
    /// </summary>
    protected void ReopenTreatmentScreen()
    {
        var window = AppNavigator.OpenTreatmentEntry(App, Settings);
        Screen = new TreatmentEntryScreen(window, App.Automation);
        Screen.WaitUntilReady();
        WaitUntilAppResponsive();
    }

    /// <summary>
    /// Chờ app hết treo trước khi thao tác tiếp.
    ///
    /// <para><c>WaitUntilReady</c> chỉ chờ lưới có DÒNG ĐẦU TIÊN — mốc đó tới rất sớm,
    /// trong khi app còn đang dựng nốt vài nghìn dòng lịch sử và không bơm message.
    /// Poke UIA vào lúc đó thì mọi tìm kiếm control đều timeout, và thông báo lỗi
    /// 「không thấy tab 個別」 sẽ chỉ người đọc đi sửa locator — hoàn toàn sai địa chỉ.</para>
    /// </summary>
    private void WaitUntilAppResponsive()
    {
        var budget = TimeSpan.FromSeconds(Math.Max(Settings.Run.GridLoadTimeoutSeconds, 60));
        if (App.WaitUntilResponsive(budget)) return;

        TestContext.Out.WriteLine(
            $"CANH BAO — app van 「(Not Responding)」 sau {budget.TotalSeconds:0}s. " +
            "Thuong la do 診療入力設定 bat pInpOpt[41] (過去データ１画面表示) nen toan bo lich su " +
            "duoc do vao luoi chinh. Doi sang benh nhan it lich su, hoac tang " +
            "run.gridLoadTimeoutSeconds. Cac buoc sau nhieu kha nang se timeout.");
    }

    /// <summary>Cửa sổ 診療入力 hiện tại còn dùng được không (F9 làm nó đóng).</summary>
    protected bool TreatmentScreenAlive()
    {
        try { return Uia.IsOnScreen(Screen.Window); }
        catch { return false; }
    }

    [OneTimeTearDown]
    public void UiTestBaseOneTimeTearDown()
    {
        _watcher?.Dispose();
        // App.Dispose() đã idempotent: nếu TearDown đã kill + dispose rồi thì
        // idempotent no-op. Tránh phải cờ phụ.
        App?.Dispose();
    }

    /// <summary>Ignore kèm lý do in ra stdout (reporter chỉ hiện dấu gạch, nuốt mất lý do).</summary>
    protected static void IgnoreWithReason(string reason)
    {
        TestContext.Out.WriteLine("IGNORE — " + reason);
        Assert.Ignore(reason);
    }

    /// <summary>DB không dùng được thì Ignore, có thì trả về.</summary>
    protected OchaDb RequireDb()
    {
        if (Db is null)
            IgnoreWithReason(
                $"Cần đọc master 処置 để biết score1/2/3 và acc_unit/f1 (cột ẩn, UI không có) — {DbUnavailableReason}");
        return Db!;
    }

    private string ScreenshotDirectory()
    {
        var dir = Settings.Run.ScreenshotDir;
        return Path.IsPathRooted(dir) ? dir : Path.Combine(AppContext.BaseDirectory, dir);
    }

    private static string ShortName(string testName)
    {
        var cut = testName.IndexOf(" — ", StringComparison.Ordinal);
        var s = cut > 0 ? testName[..cut] : testName;
        return s.Length <= 40 ? s : s[..40];
    }
}
