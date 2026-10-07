using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.RegularExpressions;
using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
using NUnit.Framework;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;
using OchaCom.FlaUiTests.Tests.TreatmentGrid;

namespace OchaCom.FlaUiTests.Tests.ParitySnapshot;

/// <summary>
/// Ghi snapshot màn 診療入力 ra JSON — schema dùng chung với vế web
/// (<c>web-tenant-tests/tests/parity-snapshot/_snapshot.ts</c>), so bằng
/// <c>tools/parity-snapshot/diff.mjs</c>.
///
/// <para>Tên file: <c>winform-&lt;case&gt;-&lt;patNo&gt;-&lt;trtDt&gt;.json</c> trong
/// <c>OCHA_SNAPSHOT_DIR</c> (không có thì <c>artifacts/parity-snapshot</c> cạnh dll).</para>
///
/// <para>Chuỗi qua <see cref="Txt.N"/> (NFKC); diff chuẩn hoá vế web cùng cách.</para>
/// </summary>
public static class InpSnapshot
{
    private const int MaxRows = 2000;

    /// <summary>Số dòng đầu của danh sách panel đem so. UIA của DataGridView chỉ phơi dòng
    /// ĐANG THẤY (FLA-UI-GUIDELINE F10) nên cả hai vế cùng cắt ở đây.</summary>
    public const int PanelRows = 12;

    /// <summary>Lưới của từng tab panel phải (frm203002.Designer.cs:1235-1769).</summary>
    private static readonly Dictionary<string, string> PanelGrids = new()
    {
        ["病検"] = "grdByou",
        ["ガイド"] = "hfgGuid1",
        ["パック"] = "grdPack",
        ["個別"] = "hfgKobetu",
    };

    /// <summary>Chọn tab panel phải (SSTab1) theo tên.</summary>
    public static void OpenPanelTab(TreatmentEntryScreen screen, string tabName)
    {
        var tab = Waits.For(
            () => screen.Window.FindFirstDescendant(cf =>
                cf.ByControlType(ControlType.TabItem).And(cf.ByName(tabName))),
            $"tab 「{tabName}」");
        var selection = tab.Patterns.SelectionItem.PatternOrDefault;
        if (selection is not null) selection.Select();
        else Uia.MouseClick(tab);
        Waits.Until(() => Uia.ById(screen.Window, PanelGrids[tabName]) is not null,
            $"lưới tab 「{tabName}」", TestSettings.Current.Run.GridLoadTimeout);
        Waits.Step();
    }

    /// <summary>Tab panel phải đang chọn + tiêu đề cột + {@link PanelRows} dòng đầu.</summary>
    public static Dictionary<string, object?> ReadPanel(TreatmentEntryScreen screen)
    {
        // Chỉ duyệt con của SSTab1: FindAllDescendants trên cả cửa sổ lặn vào lưới 個別
        // (~1.700 dòng) và UIA ném 「Operation timed out」.
        // Màn chính bị che (F12 メニュー, Shift+F5 処方…) ⇒ không có panel để đọc.
        var tabs = Uia.ById(screen.Window, "SSTab1");
        if (tabs is null) return new Dictionary<string, object?> { ["tab"] = "", ["headers"] = new List<string>(), ["rows"] = new List<List<string>>() };
        var selected = tabs.FindAllChildren(cf => cf.ByControlType(ControlType.TabItem))
            .FirstOrDefault(t => t.Patterns.SelectionItem.PatternOrDefault?.IsSelected.ValueOrDefault == true);
        var tab = selected is null ? "" : Txt.N(Uia.NameOf(selected));

        var gridEl = PanelGrids.TryGetValue(tab, out var id) ? Uia.ById(screen.Window, id) : null;
        var (headers, rows) = gridEl is null ? ([], []) : ReadGrid(gridEl, PanelRows);
        return new Dictionary<string, object?> { ["tab"] = tab, ["headers"] = headers, ["rows"] = rows };
    }


    /// <summary>
    /// Tiêu đề + tối đa <paramref name="max"/> dòng dữ liệu của một DataGridView. Dòng tiêu
    /// đề là 「Top Row」 chứa các Header (FLA-UI-GUIDELINE F11); dòng toàn ô trống bị bỏ.
    /// </summary>
    public static (List<string> Headers, List<List<string>> Rows) ReadGrid(AutomationElement gridEl, int max)
    {
        var headers = new List<string>();
        var rows = new List<List<string>>();
        foreach (var child in Uia.Children(gridEl))
        {
            if (Uia.ControlTypeOf(child) is ControlType.ScrollBar) continue;
            var cells = Uia.Children(child).ToList();
            // Dòng tiêu đề CHỈ nhận theo tên 「Top Row」: dòng dữ liệu của lưới có
            // RowHeadersVisible (grdChek…) cũng mở đầu bằng một ô kiểu Header.
            if (Uia.NameOf(child) == "Top Row")
            {
                headers = cells.Select(c => Txt.N(Uia.NameOf(c))).Where(h => h != "").ToList();
                continue;
            }
            var values = cells.Where(c => Uia.ControlTypeOf(c) != ControlType.Header)
                .Select(c => Txt.N(Uia.ValueOf(c))).ToList();
            if (values.All(v => v is "" or "(null)")) continue;
            rows.Add(values);
            if (rows.Count >= max) break;
        }
        return (headers, rows);
    }

    /// <summary>
    /// Hộp thoại đang mở trên màn 診療入力: tiêu đề + lưới đầu tiên bên trong (nếu có).
    /// Cùng schema với <c>readDialogs</c> của vế web.
    /// </summary>
    public static List<Dictionary<string, object?>> ReadDialogs(OchaApp app, Window main)
    {
        var result = new List<Dictionary<string, object?>>();
        // Hộp thoại sở hữu bởi form chính + mọi cửa sổ cấp cao KHÁC đang hiện của app (歯科疾患管理
        // … mở như màn riêng, không phải hộp thoại con).
        List<Window> windows;
        try { windows = ModalDialogs.All(app, main).ToList(); }
        catch { windows = []; } // form chính đã đóng (F10 戻る)
        try
        {
            foreach (var w in app.Application.GetAllTopLevelWindows(app.Automation))
            {
                string mainId;
                try { mainId = Uia.AutomationIdOf(main); } catch { mainId = ""; }
                if ((mainId != "" && Uia.AutomationIdOf(w) == mainId) || !Uia.IsOnScreen(w)) continue;
                if (windows.Any(x => Uia.NameOf(x) == Uia.NameOf(w))) continue;
                if (Uia.ClassNameOf(w) == "#32768") continue; // menu ngữ cảnh
                // Màn RIÊNG (一覧 master…) — chỉ lấy tiêu đề: duyệt lưới nghìn dòng của nó qua UIA
                // tốn nhiều phút rồi timeout (đo 2026-10-05: 必要病名登録 4m31s).
                result.Add(new Dictionary<string, object?>
                {
                    ["title"] = Txt.N(Uia.NameOf(w)),
                    ["headers"] = new List<string>(),
                    ["rows"] = new List<List<string>>(),
                    ["text"] = "",
                });
            }
        }
        catch { /* tiến trình bận */ }
        foreach (var d in windows)
        {
            try
            {
                // Hộp thoại có thể có NHIỀU lưới (薬剤選択: danh sách trái + 「đã chọn」 phải) —
                // lấy lưới nhiều dòng nhất, tức danh sách chính.
                var grids = d.FindAllDescendants(cf => cf.ByControlType(ControlType.DataGrid)
                    .Or(cf.ByControlType(ControlType.Table)));
                var gridEl = grids.FirstOrDefault();
                var (headers, rows) = gridEl is null ? ([], []) : ReadGrid(gridEl, PanelRows);
                foreach (var g in grids.Skip(1))
                {
                    var other = ReadGrid(g, PanelRows);
                    if (other.Rows.Count > rows.Count) (headers, rows, gridEl) = (other.Headers, other.Rows, g);
                }
                result.Add(new Dictionary<string, object?>
                {
                    ["title"] = Txt.N(Uia.NameOf(d)),
                    ["headers"] = headers,
                    ["rows"] = rows,
                    // Chỉ hộp THÔNG BÁO (MsgBox Win32, lớp #32770) mới so chữ — form nghiệp vụ
                    // (部位選択…) đầy nhãn phụ hai bên vẽ khác nhau, so chữ chỉ ra nhiễu.
                    ["text"] = Uia.ClassNameOf(d) == "#32770" ? Txt.N(Dialogs.TextOf(d)) : "",
                });
            }
            catch { /* hộp thoại vừa đóng */ }
        }
        return result;
    }

    /// <summary>入力モード (nhãn <c>lbInpMode</c>: 「点数」/「コード」).</summary>
    public static string InpMode(TreatmentEntryScreen screen) =>
        Uia.ById(screen.Window, "lbInpMode") is { } box ? Txt.N(Uia.ValueOf(box)) : "";

    /// <summary>Bấm nhãn 入力モード cho tới khi đúng <paramref name="want"/> (frm203002 lbInpMode_Click).</summary>
    public static void EnsureMode(TreatmentEntryScreen screen, string want)
    {
        for (var i = 0; i < 3 && !Txt.Same(InpMode(screen), want); i++)
        {
            var (x, y) = Uia.Center(Uia.RequireById(screen.Window, "lbInpMode"));
            Uia.LeftClickPhysical(x, y);
            Waits.Step();
            Thread.Sleep(400);
        }
        Assert.That(InpMode(screen), Is.EqualTo(want), $"không chuyển được 入力モード sang 「{want}」");
    }

    /// <summary>
    /// Gõ <paramref name="typed"/> vào ô 点 của dòng 日計 cuối cùng (ô vàng — chỗ nhập 処置
    /// mới của ngày) rồi Enter.
    /// </summary>
    public static void TypeIntoFooterTen(TreatmentEntryScreen screen, string typed)
    {
        var ops = new TreatmentGridOps(screen);
        var row = ops.Snapshot().LastOrDefault(r => Txt.Has(r.Ryo, "日計"));
        Assert.That(row, Is.Not.Null, "lưới không có dòng 日計");
        ops.FocusCell(row!, RegiGrid.Col.Ten);
        if (!ops.IsEditing()) ops.Press(VirtualKeyShort.RETURN);
        Thread.Sleep(300);
        ops.Type(typed);
        ops.Press(VirtualKeyShort.RETURN);
        Thread.Sleep(800);
    }

    /// <summary>
    /// Con cháu của form chính, KHÔNG lặn vào cửa sổ con (hộp thoại 処置選択… cũng có
    /// btnF9 「確定」 riêng và nằm dưới form chính trong cây UIA).
    /// </summary>
    private static IEnumerable<AutomationElement> MainFormDescendants(AutomationElement root, int depth)
    {
        if (depth <= 0) yield break;
        foreach (var child in Uia.Children(root))
        {
            if (Uia.ControlTypeOf(child) == ControlType.Window) continue;
            yield return child;
            foreach (var d in MainFormDescendants(child, depth - 1)) yield return d;
        }
    }

    /// <summary>Ô 選択№ của từng tab panel phải (testsettings locators).</summary>
    private static readonly Dictionary<string, string> PanelSelNo = new()
    {
        ["個別"] = "txtKobetuSel",
        ["ガイド"] = "txtGuid1Sel",
        ["パック"] = "txtPackSentakuNo",
    };

    /// <summary>Gõ số vào ô 選択№ của tab rồi Enter (gõ phím thật — FLA-UI-GUIDELINE F13).</summary>
    public static void SelectNo(TreatmentEntryScreen screen, string tab, int no)
    {
        var box = Uia.RequireById(screen.Window, PanelSelNo[tab]);
        Uia.MouseClick(box);
        Keyboard.TypeSimultaneously(VirtualKeyShort.CONTROL, VirtualKeyShort.KEY_A);
        Keyboard.Type(no.ToString());
        Keyboard.Press(VirtualKeyShort.RETURN);
        Thread.Sleep(1500);
    }

    /// <summary>
    /// Bấm lần lượt các mục menu ngữ cảnh theo chữ (bỏ 「&」) — popup Win32 lớp #32768 trên
    /// desktop, cùng cách <c>InpP1MenuFlow</c> tìm.
    /// </summary>
    public static void ClickMenuPath(OchaApp app, params string[] texts)
    {
        foreach (var text in texts)
        {
            var item = Waits.For(() => FindMenuItem(app, text), $"mục menu 「{text}」");
            Uia.MouseClick(item);
            Thread.Sleep(600);
        }
    }

    /// <summary>
    /// Mục menu đang hiện có chữ <paramref name="text"/>: ContextMenuStrip của WinForms là cửa sổ
    /// cấp cao của tiến trình app; menu Win32 thì là popup lớp #32768 trên desktop. Dò cả hai.
    /// </summary>
    private static AutomationElement? FindMenuItem(OchaApp app, string text)
    {
        var roots = new List<AutomationElement>();
        try { roots.AddRange(app.Application.GetAllTopLevelWindows(app.Automation)); } catch { /* bận */ }
        try { roots.AddRange(OchaApp.SharedAutomation.GetDesktop().FindAllChildren(cf => cf.ByClassName("#32768"))); } catch { /* bận */ }
        foreach (var root in roots)
        {
            try
            {
                if (!Uia.IsOnScreen(root)) continue;
                var hit = root.FindAllDescendants(cf => cf.ByControlType(ControlType.MenuItem))
                    .FirstOrDefault(i => Uia.IsOnScreen(i) && Txt.N(Uia.NameOf(i).Replace("&", "")).Contains(Txt.N(text)));
                if (hit is not null) return hit;
            }
            catch { /* cửa sổ vừa đóng */ }
        }
        return null;
    }

    /// <summary>
    /// Lưới 履歴 (grdHist — gán vào hFG2 lúc chạy, frm203002.cs:679): DataGrid của form chính
    /// có cột 「療法・処置」 mà KHÔNG phải grdRegi. Không hiện thì trả rỗng.
    /// </summary>
    public static List<List<string>> ReadHistory(TreatmentEntryScreen screen)
    {
        foreach (var el in MainFormDescendants(screen.Window, depth: 8))
        {
            if (Uia.ControlTypeOf(el) is not (ControlType.DataGrid or ControlType.Table)) continue;
            if (Uia.AutomationIdOf(el) == "grdRegi" || !Uia.IsOnScreen(el)) continue;
            var (headers, rows) = ReadGrid(el, 400);
            if (headers.Any(h => Txt.Has(h, "療法"))) return rows;
        }
        return [];
    }

    /// <summary>Các mục menu ngữ cảnh đang hiện: chữ (bỏ 「&」 và số mnemonic) + có bấm được không.</summary>
    public static List<Dictionary<string, object?>> ReadMenuItems(OchaApp app)
    {
        var roots = new List<AutomationElement>();
        try { roots.AddRange(app.Application.GetAllTopLevelWindows(app.Automation)); } catch { /* bận */ }
        try { roots.AddRange(OchaApp.SharedAutomation.GetDesktop().FindAllChildren(cf => cf.ByClassName("#32768"))); } catch { /* bận */ }
        var items = new List<Dictionary<string, object?>>();
        foreach (var root in roots)
        {
            try
            {
                if (!Uia.IsOnScreen(root)) continue;
                foreach (var i in root.FindAllChildren(cf => cf.ByControlType(ControlType.MenuItem))
                             .Concat(root.FindAllDescendants(cf => cf.ByControlType(ControlType.MenuItem))).Distinct())
                {
                    if (!Uia.IsOnScreen(i)) continue;
                    var text = Txt.N(Uia.NameOf(i).Replace("&", ""));
                    if (text == "" || items.Any(x => (string)x["text"]! == text)) continue;
                    items.Add(new Dictionary<string, object?> { ["text"] = text, ["enabled"] = i.IsEnabled });
                }
            }
            catch { /* cửa sổ vừa đóng */ }
        }
        return items;
    }

    /// <param name="extra">Dữ liệu riêng của kịch bản (panel bên phải, hộp thoại…), so theo khoá.</param>
    public static string Write(TreatmentEntryScreen screen, int patNo, DateTime trtDate, string caseName,
        IReadOnlyDictionary<string, object?>? extra = null)
    {
        // Một số nút (歯管, 指導文書…) mở MÀN KHÁC che mất 診療入力 ⇒ grdRegi biến mất khỏi cây
        // UIA. Khi đó vẫn ghi snapshot (mainHidden) để so các cửa sổ đang mở.
        // Cửa sổ 診療入力 có thể đã ĐÓNG hẳn (F10 戻る) — mọi truy vấn UIA vào nó ném lỗi.
        bool mainHidden;
        try { mainHidden = Uia.ById(screen.Window, "grdRegi") is null; }
        catch { mainHidden = true; }
        var ops = new TreatmentGridOps(screen);

        var fkeys = new SortedDictionary<string, string>(StringComparer.Ordinal);
        if (!mainHidden)
            foreach (var el in MainFormDescendants(screen.Window, depth: 6))
            {
                if (Uia.ControlTypeOf(el) != ControlType.Button) continue;
                var id = Uia.AutomationIdOf(el);
                // btnF1..btnF12 = lớp thường (lớp Shift là btnF4_S…).
                if (!Regex.IsMatch(id, @"^btnF\d{1,2}$")) continue;
                fkeys[id["btn".Length..]] = Txt.N(Uia.NameOf(el));
            }

        var allExtra = new Dictionary<string, object?>(extra ?? new Dictionary<string, object?>());
        if (mainHidden) allExtra["mainHidden"] = true;
        var snapshot = new Dictionary<string, object?>
        {
            ["source"] = "winform",
            ["case"] = caseName,
            ["patNo"] = patNo.ToString(),
            ["trtDt"] = trtDate.ToString("yyyy-MM-dd"),
            ["header"] = mainHidden
                ? new Dictionary<string, string>()
                : new Dictionary<string, string>
                {
                    ["patNo"] = screen.PatientNo(),
                    ["ym"] = screen.YearMonth(),
                    ["total"] = ops.AllPoint(),
                    ["days"] = ops.Days(),
                },
            ["fkeys"] = fkeys,
            ["rows"] = mainHidden
                ? new List<string[]>()
                : ops.Snapshot(MaxRows).Select(r => new[] { r.Day, r.Bui, r.Ryo, r.Ten, r.Kai }).ToList(),
            ["extra"] = allExtra,
        };

        var dir = Environment.GetEnvironmentVariable("OCHA_SNAPSHOT_DIR");
        if (string.IsNullOrWhiteSpace(dir)) dir = Path.Combine(AppContext.BaseDirectory, "artifacts", "parity-snapshot");
        Directory.CreateDirectory(dir);
        var path = Path.Combine(dir, $"winform-{caseName}-{patNo}-{trtDate:yyyy-MM-dd}.json");
        File.WriteAllText(path, JsonSerializer.Serialize(snapshot, new JsonSerializerOptions
        {
            WriteIndented = true,
            Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        }));

        var rows = (List<string[]>)snapshot["rows"]!;
        TestContext.Progress.WriteLine($"=== SNAPSHOT {caseName} === {rows.Count} rows{(mainHidden ? " (màn chính bị che)" : "")} → {path}");
        if (!mainHidden) Assert.That(rows, Is.Not.Empty, "lưới grdRegi không đọc được dòng nào");
        return path;
    }
}
