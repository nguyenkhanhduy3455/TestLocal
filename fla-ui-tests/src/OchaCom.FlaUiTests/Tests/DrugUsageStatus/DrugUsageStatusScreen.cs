using FlaUI.Core.AutomationElements;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.DrugUsageStatus;

/// <summary>Kết cục của một lượt 集計: các hộp thoại gặp phải (nguyên văn) và lưới đọc ra.</summary>
public sealed record DrugUsageRun(
    string ReportYm,
    TimeSpan Elapsed,
    IReadOnlyList<string> Dialogs,
    IReadOnlyList<IReadOnlyList<string>> Rows,
    bool TimedOut);

/// <summary>
/// Màn 医薬品使用状況 <c>frm506011</c> — nửa WinForm của
/// <c>web-tenant-tests/tests/dialogs-management/drug-usage-status.spec.ts</c>.
///
/// <code>
///   メインメニュー   pnlBtn4  → その他業務               (MainMenu.cs:355)
///                    pnlMenu1 → ID506001 初期設定        (MainMenu.cs:862)
///   frm506001        btnFacilityConfig.Click → showDialog(ID506009) (frm506001.cs:127-130)
///   frm506009        dgvView.CellDoubleClick, cột ≠ 3/4, facility_cd 3487/3488/3598
///                    → showForm(ID506011)                 (frm506009.cs:236-246)
///   frm506011        dtSum (CustomDate, ô 日 bị delDay ẩn — frm506011.cs:150)
///                    btnSearch.MouseClick → takeRecepts   (frm506011.cs:108-121)
///                    dgvView (frm901003)
/// </code>
///
/// <para>Ba điều đọc ra từ source, đừng vấp:</para>
/// <list type="number">
/// <item><c>btnSearch</c> nghe <c>MouseClick</c> chứ không phải <c>Click</c> ⇒ phải click chuột
///       thật (F13).</item>
/// <item><c>SelDate</c> của <c>CustomDate</c> chỉ ghi ở <c>Leave</c>; DoWork đọc
///       <c>dtSum.SelDate</c> (frm506011.cs:245) ⇒ gõ xong phải dời focus rồi mới 集計.</item>
/// <item>W00002 bung SAU thanh tiến trình khi DoWork đặt <c>e.Cancel</c>
///       (frm506011.cs:196-199, 259-262) — lưới vẫn được gắn ngay sau đó.</item>
/// </list>
/// </summary>
public sealed class DrugUsageStatusScreen
{
    public const string WindowId = "frm506011";
    public const string InitSettingsId = "frm506001";
    public const string FacilityId = "frm506009";
    public const string ProgressWindowId = "frm902005";

    /// <summary>届出略称 của dòng mở frm506011 (facility_cd 3487).</summary>
    public const string GenericUse1 = "後発使１";

    private readonly OchaApp _app;
    private readonly Window _window;

    private DrugUsageStatusScreen(OchaApp app, Window window)
    {
        _app = app;
        _window = window;
    }

    public Window Window => _window;

    public AutomationElement Grid => Uia.RequireById(_window, "dgvView");

    // ── Đường vào ────────────────────────────────────────────────────────────

    public static DrugUsageStatusScreen Open(OchaApp app, TestSettings settings, TestTrace trace)
    {
        var timeout = TimeSpan.FromSeconds(settings.App.LaunchTimeoutSeconds);
        if (app.Window(WindowId) is { } already) return new DrugUsageStatusScreen(app, already);

        var init = app.Window(InitSettingsId);
        if (init is null)
        {
            var menu = Waits.TryFor(() => app.Window("MainMenu") ?? app.WindowByTitle("メインメニュー"), timeout)
                       ?? throw new TimeoutException("Không thấy メインメニュー. " + DescribeDialogs(app));
            trace.Do("メインメニュー → その他業務", () => ClickPane(menu, "pnlBtn4"));
            trace.Do("その他業務 → 初期設定", () => ClickPane(menu, "pnlMenu1"));
            init = app.RequireWindow(InitSettingsId, timeout);
        }
        trace.Shot("frm506001 初期設定");

        trace.Do("初期設定 → 施設基準届出設定", () =>
        {
            var button = Waits.For(() => Uia.ById(init, "btnFacilityConfig"), "nút 「btnFacilityConfig」");
            // Chuột thật: Invoke là đồng bộ và nút này mở showDialog modal ⇒ Invoke không trả về (F18).
            Uia.MouseClick(button);
            Waits.Step();
        });

        // showDialog ⇒ frm506009 có thể là con của frm506001 trong cây UIA, không phải top-level.
        var facility = Waits.TryFor(() => FindForm(app, FacilityId), TimeSpan.FromSeconds(15))
                       ?? throw new TimeoutException("frm506009 không mở. " + DescribeDialogs(app));
        trace.Shot("frm506009 施設基準届出設定");

        trace.Do("double-click 届出略称 của 後発使１", () => OpenFromGenericUseRow(facility));

        var window = Waits.TryFor(() => app.Window(WindowId), TimeSpan.FromSeconds(20))
                     ?? throw new TimeoutException("Double-click 後発使１ mà frm506011 không mở. " + DescribeDialogs(app));
        trace.Shot("frm506011 mở");
        return new DrugUsageStatusScreen(app, window);
    }

    /// <summary>Tìm form theo AutomationId ở top-level hoặc ngay dưới một top-level (modal con).</summary>
    private static AutomationElement? FindForm(OchaApp app, string id)
    {
        foreach (var w in app.Windows())
        {
            if (Uia.AutomationIdOf(w) == id) return w;
            var child = Uia.Children(w).FirstOrDefault(c => Uia.AutomationIdOf(c) == id && Uia.IsOnScreen(c));
            if (child is not null) return child;
        }
        return null;
    }

    /// <summary>
    /// Lưới frm506009 chỉ phơi dòng đang nhìn thấy (F10) ⇒ chọn dòng đầu rồi Down tới khi dòng
    /// 後発使１ hiện ra, sau đó double-click CHUỘT THẬT vào ô 届出略称 (cột 0 ≠ 3/4).
    /// </summary>
    private static void OpenFromGenericUseRow(AutomationElement facility)
    {
        var grid = Waits.For(() => Uia.ById(facility, "dgvView"), "lưới 「dgvView」 của frm506009");
        var dgv = new WinFormsGrid(grid);

        AutomationElement? Target() =>
            dgv.RowElements()
               .Select(r => Uia.Children(r).FirstOrDefault())
               // Txt.N chuẩn hoá NFKC (「１」→「1」) ⇒ phải so với hằng ĐÃ chuẩn hoá.
               .FirstOrDefault(c => c is not null && Uia.IsOnScreen(c) && Txt.N(Uia.ValueOf(c)) == Txt.N(GenericUse1));

        var cell = Target();
        if (cell is null)
        {
            Uia.ForceForeground(facility.Properties.NativeWindowHandle);
            grid.Focus();
            // Page Down từng khung: mỗi lượt Target() quét cả lưới qua UIA nên Down từng dòng rất chậm.
            for (var i = 0; i < 12 && cell is null; i++)
            {
                Uia.SendKey(Vk.Next);
                Thread.Sleep(150);
                cell = Target();
            }
        }
        if (cell is null) throw new InvalidOperationException("Không tìm thấy dòng 後発使１ trong lưới frm506009.");

        var (x, y) = Uia.Center(cell);
        Uia.DoubleClickPhysical(x, y);
        Waits.Step();
    }

    private static void ClickPane(AutomationElement window, string automationId)
    {
        var pane = Waits.For(() => Uia.ById(window, automationId), $"pane 「{automationId}」");
        Uia.MouseClick(pane);
        Waits.Step();
    }

    // ── 届出年月 ─────────────────────────────────────────────────────────────

    /// <summary>Đặt 届出年月 = yyyyMM (元号 + 年 + 月) rồi dời focus sang lưới.</summary>
    public void SetReportYm(string ym)
    {
        var year = int.Parse(ym[..4]);
        var month = int.Parse(ym[4..]);
        var (eraName, startYear) = EraOf(year, month);

        var date = Uia.RequireById(_window, "dtSum");
        SelectEra(date, eraName);
        Uia.SetText(Waits.For(() => Uia.ById(date, "txtYear"), "ô 年 của 届出年月"), (year - startYear).ToString());
        Uia.SetText(Waits.For(() => Uia.ById(date, "txtMonth"), "ô 月 của 届出年月"), month.ToString());

        // CustomDate_Leave mới ghi SelDate — lưới ReadOnly nên focus vào đó không đổi gì.
        try { Grid.Focus(); }
        catch
        {
            Uia.ForceForeground(_window.Properties.NativeWindowHandle);
            Uia.SendKey(0x09);
        }
        Waits.Step();
        Thread.Sleep(200);
    }

    private static (string Name, int StartYear) EraOf(int year, int month)
    {
        if (year > 2019 || (year == 2019 && month >= 5)) return ("令和", 2018);
        return ("平成", 1988);
    }

    private static void SelectEra(AutomationElement dateControl, string eraName)
    {
        var combo = Waits.For(() => Uia.ById(dateControl, "cboEra"), "combo 元号 「cboEra」").AsComboBox();
        string Current()
        {
            try { return combo.SelectedItem is { } s ? Uia.NameOf(s) : combo.EditableText; }
            catch { return Uia.ValueOf(combo); }
        }
        if (Txt.N(Current()).StartsWith(eraName, StringComparison.Ordinal)) return;

        try { combo.Expand(); Thread.Sleep(250); } catch { /* không có ExpandCollapsePattern */ }
        IReadOnlyList<AutomationElement> items;
        try { items = combo.Items; } catch { items = []; }
        var hit = items.FirstOrDefault(i => Txt.N(Uia.NameOf(i)).StartsWith(eraName, StringComparison.Ordinal))
                  ?? throw new InvalidOperationException($"cboEra không có 元号 「{eraName}」.");
        try { hit.AsListBoxItem().Select(); } catch { Uia.MouseClick(hit); }
        Waits.Step();
        Thread.Sleep(200);
    }

    // ── 集計 ─────────────────────────────────────────────────────────────────

    /// <summary>
    /// Đặt 届出年月, click chuột thật vào 集計, chờ thanh tiến trình + dẹp mọi MessageBox
    /// (ghi nguyên văn), rồi đọc toàn bộ lưới (9 dòng vừa khung, không phải cuộn).
    /// </summary>
    public DrugUsageRun Run(string ym, TimeSpan budget, TestTrace trace)
    {
        SetReportYm(ym);
        var clock = System.Diagnostics.Stopwatch.StartNew();
        var dialogs = new List<string>();

        Uia.ForceForeground(_window.Properties.NativeWindowHandle);
        Uia.MouseClick(Uia.RequireById(_window, "btnSearch"));
        trace.Note($"{ym}: đã bấm 集計");

        System.Diagnostics.Stopwatch? quiet = null;
        while (clock.Elapsed < budget)
        {
            foreach (var box in MsgBoxWin32.All(_app.ProcessId))
            {
                var text = box.Text.Length > 0 ? box.Text : box.Title;
                dialogs.Add(OneLine(text));
                trace.Note($"{ym}: hộp thoại 「{OneLine(text)}」");
                MsgBoxWin32.ClickButton(box.Hwnd, "OK", "はい", "Yes");
                quiet = null;
            }
            if (FindForm(_app, ProgressWindowId) is not null)
            {
                quiet = null;
                Thread.Sleep(250);
                continue;
            }
            quiet ??= System.Diagnostics.Stopwatch.StartNew();
            if (quiet.Elapsed > TimeSpan.FromSeconds(2)) break;
            Thread.Sleep(200);
        }
        clock.Stop();

        var rows = new WinFormsGrid(Grid).Rows()
                                         .Select(r => (IReadOnlyList<string>)r.Cells.Select(c => c.Trim(' ', '　')).ToList())
                                         .Where(r => r.Any(c => c.Length > 0))
                                         // 「Top Row」 lọt qua IsHeaderRow (F11): bỏ dòng mang nhãn cột.
                                         .Where(r => !(r.Count > 1 && r[1] == "3ヶ月前"))
                                         .ToList();
        return new DrugUsageRun(ym, clock.Elapsed, dialogs, rows, clock.Elapsed >= budget);
    }

    private static string OneLine(string s) => s.Replace("\r", " ").Replace("\n", " ").Trim();

    private static string DescribeDialogs(OchaApp app)
    {
        var texts = MsgBoxWin32.All(app.ProcessId).Select(d => OneLine(d.ToString())).Where(t => t.Length > 0).ToList();
        return texts.Count == 0 ? "Không có hộp thoại nào đang mở." : "Hộp thoại đang mở: " + string.Join(" / ", texts);
    }
}
