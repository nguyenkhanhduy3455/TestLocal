using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using FlaUI.Core.Input;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.StepsEdit;

/// <summary>
/// Lái đường tới dialog <c>frm203050</c> 「Ｓｔｅｐ編集」 từ menu của
/// <c>frm203002</c>（診療入力）.
///
/// ═══════════════════════════════════════════════════════════════════════
/// ĐƯỜNG ĐI ĐẾN 「Step」
/// ═══════════════════════════════════════════════════════════════════════
/// Source <c>frm203002.Designer.cs:374</c>: <c>grdRegi.ContextMenuStrip =
/// contextMenuStripSentaku</c>. Trong menu đó có <c>IDM_Option</c>
/// (Text "<c>&amp;9 オプション</c>", Designer.cs:2826-2838) chứa <c>IDM_Step</c>
/// (Text "<c>Step</c>", Designer.cs:2897-2902). Cột 「日」 của grdRegi có
/// menu riêng <c>contextMenuStripDateChg</c> (chỉ có 「日付変更」) — phải
/// click chuột phải vào cell KHÁC cột 「日」 mới mở đúng menu có Step.
///
/// <para>Cách mở: RightClick vào cell cột 部位 / 療法・処置 → context menu
/// hiện → click 「オプション」 (bung submenu) → click 「Step」.</para>
///
/// <para><b>Vì sao không dùng phím tắt</b>: Step không có ShortcutKeys.
/// Thử Alt+9 mở menu オプション nhưng WinForms Top-Level Menu cần ToolStrip
/// ở dock Top — app này menu オプション là ContextMenuStrip nên Alt+9 không
/// hoạt động đáng tin cậy.</para>
/// </summary>
public static class StepsEditFlow
{
    /// <summary>AutomationId của dialog — đặt trong Designer (frm203050.Designer.cs).</summary>
    public const string DialogAutomationId = "frm203050";

    /// <summary>Tiêu đề hiển thị (<c>_title</c> trong frm203050.cs:37).</summary>
    public const string DialogTitleFragment = "Ｓｔｅｐ編集";

    /// <summary>Tên control Combo chọn loại (kind=1..15).</summary>
    public const string CboKindId = "cboKind";

    /// <summary>
    /// Mở dialog frm203050 từ menu Step của 診療入力.
    ///
    /// <para><b>Đường đi</b>: RightClick trên cell <c>grdRegi</c> (KHÔNG phải cột 「日」)
    /// để mở <c>contextMenuStripSentaku</c> → click 「オプション」 (IDM_Option, Text
    /// "<c>&amp;9 オプション</c>") để bung submenu → click 「Step」 (IDM_Step, Text
    /// "<c>Step</c>").</para>
    /// </summary>
    public static Window OpenStepsDialog(OchaApp app, Window screen, TestTrace? trace = null)
    {
        try { screen.SetForeground(); } catch { /* không quan trọng */ }
        screen.Focus();
        Waits.Step();

        trace?.Step("mo context menu cua grdRegi → オプション > Step");

        // 1) RightClick vào 1 cell KHÔNG thuộc cột 「日」 (cột 0) của grdRegi để
        //    mở contextMenuStripSentaku (chứa IDM_Option > IDM_Step). Cell thuộc
        //    cột 0 mở contextMenuStripDateChg (chỉ có 日付変更 — sai mục).
        OpenContextMenuOnGrdRegi(app, screen, trace);

        // 2) Trong popup vừa hiện, tìm và click 「オプション」 để bung submenu.
        var popup = WaitForContextMenuPopup(app, trace);
        if (popup is null)
            throw new InvalidOperationException(
                "RightClick khong mo duoc context menu tren grdRegi. " +
                "Kiem lai frm203002.Designer.cs:374 (grdRegi.ContextMenuStrip) va " +
                "vi tri click co dung cell khong thuoc cot 0 khong.");

        trace?.Note($"popup menu ClassName='{Uia.ClassNameOf(popup)}' " +
                    $"Name='{Uia.NameOf(popup)}'");

        // Dump popup để debug.
        var dump = Uia.DumpTree(popup, maxDepth: 4, maxChildrenPerNode: 30);
        WriteArtifact("steps-edit-contextmenu.uia.txt", dump);

        var optionItem = FindMenuItemByText(popup, "オプション")
            ?? FindMenuItemByText(popup, "9 ");  // "&9 オプション" — text có thể là "9 オプション" qua UIA
        if (optionItem is null)
            throw new InvalidOperationException(
                "Da mo context menu nhung khong thay muc 「オプション」. " +
                "Xem file: steps-edit-contextmenu.uia.txt.");

        trace?.Note($"LeftClick 「{Uia.NameOf(optionItem)}」");
        var (ox, oy) = Uia.Center(optionItem);
        Uia.LeftClickPhysical(ox, oy);
        Thread.Sleep(400);

        // 3) Submenu bung — tìm 「Step」 bên trong.
        var sub = WaitForContextMenuPopup(app, trace);
        if (sub is null)
            throw new InvalidOperationException(
                "Da click 「オプション」 nhung khong thay submenu bung ra.");

        var subDump = Uia.DumpTree(sub, maxDepth: 3, maxChildrenPerNode: 30);
        WriteArtifact("steps-edit-optionsubmenu.uia.txt", subDump);

        var stepItem = FindMenuItemByText(sub, "Step")
            ?? FindMenuItemByText(sub, "Ｓｔｅｐ")
            ?? FindMenuItemByText(sub, "ステップ")
            ?? throw new InvalidOperationException(
                "Submenu 「オプション」 da bung nhung khong thay muc 「Step」. " +
                "Xem file: steps-edit-optionsubmenu.uia.txt.");

        trace?.Note($"LeftClick 「{Uia.NameOf(stepItem)}」");
        var (sx, sy) = Uia.Center(stepItem);
        Uia.LeftClickPhysical(sx, sy);
        Waits.Step();

        // Khi menu đóng, dialog mở — nhưng app có thể kẹt ở menu một lúc.
        var timeout = TimeSpan.FromSeconds(TestSettings.Current.Run.DefaultTimeoutSeconds);

        trace?.Step($"cho dialog 「{DialogTitleFragment}」 hien len");
        var dialog = Waits.For(() => app.Window(DialogAutomationId),
                               $"dialog {DialogAutomationId} hien len sau khi click menu Step",
                               timeout);

        // Đợi initProc() xong: cboKind phải có Items.Length > 0.
        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            var cb = Uia.ById(dialog, CboKindId);
            if (cb?.AsComboBox()?.Items.Length > 0) break;
            Thread.Sleep(50);
        }

        var finalCb = Uia.ById(dialog, CboKindId);
        if (finalCb?.AsComboBox()?.Items.Length is null or 0)
            throw new InvalidOperationException(
                $"Dialog {DialogAutomationId} da mo nhung cboKind rong — " +
                $"initProc() chua nap xong sau {timeout.TotalSeconds:0}s. " +
                $"Kiem cod_mst kind=70 co du lieu khong.");

        trace?.Shot("dialog-mo");
        return dialog;
    }

    /// <summary>RightClick vào 1 cell KHÔNG thuộc cột 「日」 của grdRegi.</summary>
    private static void OpenContextMenuOnGrdRegi(OchaApp app, Window screen, TestTrace? trace)
    {
        var grid = Uia.ById(screen, "grdRegi")
            ?? throw new InvalidOperationException("Khong thay grdRegi tren frm203002.");

        AutomationElement? dataCell = null;
        try
        {
            var cells = grid.FindAllDescendants(cf => cf.ByControlType(ControlType.DataItem));
            foreach (var c in cells)
            {
                var rect = c.BoundingRectangle;
                var name = Uia.NameOf(c) ?? "";
                if (rect.X <= 360) continue;  // bỏ cột 「日」 (X≈326..354)
                if (name.Contains("Row 1")) { dataCell = c; break; }
            }
        }
        catch { /* thử cách khác */ }

        if (dataCell is null)
        {
            // Không tìm được cell Row 1 — RightClick vào giữa grid, cách xa cột 「日」.
            var (gx, gy) = Uia.Center(grid);
            trace?.Note($"khong thay cell Row 1, RightClick vao giua grid ({gx},{gy})");
            Mouse.Click(new System.Drawing.Point(gx, gy), MouseButton.Right);
            return;
        }

        // SelectionItemPattern.Select() để chắc chắn cell là "current" khi user
        // right-click — ContextMenuStrip của DataGridView nhiều khi chỉ mở khi
        // cell đang active.
        try
        {
            if (dataCell.Patterns.SelectionItem.IsSupported)
                dataCell.Patterns.SelectionItem.Pattern.Select();
        }
        catch { /* bỏ qua */ }

        var (x, y) = Uia.Center(dataCell);
        trace?.Note($"ESC + LeftClick + RightClick cell 「{Uia.NameOf(dataCell)}」 tai ({x},{y})");
        // Bước 0: ESC để thoát edit mode (DataGridView có thể đang edit 1 cell, khi
        //         đó RightClick bị nuốt, không mở ContextMenuStrip).
        Keyboard.Press(FlaUI.Core.WindowsAPI.VirtualKeyShort.ESCAPE);
        Thread.Sleep(50);
        // Bước 1: LeftClick để focus app + chọn cell.
        Mouse.Click(new System.Drawing.Point(x, y), MouseButton.Left);
        Thread.Sleep(150);
        // ESC lần nữa sau khi chọn cell (LeftClick có thể bật edit mode).
        Keyboard.Press(FlaUI.Core.WindowsAPI.VirtualKeyShort.ESCAPE);
        Thread.Sleep(50);
        // Bước 2: RightClick — Mouse.Click của FlaUI gửi WM_RBUTTONDOWN + UP
        //         qua SendInput (đó mới là thứ .NET Control nghe được).
        Mouse.Click(new System.Drawing.Point(x, y), MouseButton.Right);
    }

    /// <summary>Tìm MenuItem có Name chứa chuỗi cho trước.</summary>
    private static AutomationElement? FindMenuItemByText(AutomationElement root, string needle)
    {
        foreach (var item in root.FindAllDescendants(cf => cf.ByControlType(ControlType.MenuItem)))
        {
            var name = Uia.NameOf(item) ?? "";
            if (Txt.Has(name, needle)) return item;
        }
        return null;
    }

    /// <summary>Chờ popup menu (#32768 hoặc ControlType.Menu) hiện ra. Trả về null nếu quá timeout.</summary>
    private static AutomationElement? WaitForContextMenuPopup(OchaApp app, TestTrace? trace)
    {
        var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(3);
        AutomationElement? popup = null;
        while (DateTime.UtcNow < deadline)
        {
            popup = FindAnyContextMenuPopup(app);
            if (popup is not null) break;
            Thread.Sleep(50);
        }
        return popup;
    }

    /// <summary>
    /// Tìm cửa sổ pop-up menu đang hiện — bất kể do Windows quản lý (ClassName
    /// <c>#32768</c>) hay do .NET <c>ContextMenuStrip</c> quản lý. Đi qua cả
    /// desktop root lẫn app process.
    /// </summary>
    private static AutomationElement? FindAnyContextMenuPopup(OchaApp app)
    {
        // Nguồn 1: desktop (popup do Windows quản lý).
        var desktop = OchaApp.SharedAutomation.GetDesktop();
        foreach (var m in desktop.FindAllChildren(cf => cf.ByClassName("#32768")))
        {
            try { if (Uia.IsOnScreen(m)) return m; }
            catch { /* vừa đóng */ }
        }

        // Nguồn 2: cửa sổ top-level của app, lọc ControlType.Menu.
        foreach (var w in app.Windows())
        {
            try
            {
                if (w.ControlType == ControlType.Menu) return w;
            }
            catch { /* bỏ qua */ }
        }

        return null;
    }

    private static void WriteArtifact(string fileName, string content)
    {
        var outDir = TestSettings.Current.Run.ScreenshotDir;
        var fullDir = Path.IsPathRooted(outDir)
            ? outDir
            : Path.Combine(AppContext.BaseDirectory, outDir);
        Directory.CreateDirectory(fullDir);
        File.WriteAllText(Path.Combine(fullDir, fileName), content);
    }

    /// <summary>
    /// Đóng dialog bằng nút F10 戻る. Chờ dialog đóng thật trước khi trả về.
    ///
    /// <para><c>BaseDialog</c> kế thừa <c>BaseForm</c> có thể bật
    /// <c>CS_NOCLOSE</c> (BaseForm.cs:43-57). Đừng bấm nút X.</para>
    /// </summary>
    public static void CloseByBack(Window dialog, TestTrace? trace)
    {
        trace?.Step("dong dialog bang F10 戻る");

        var btn = Uia.ByIdOrName(dialog, "btnF10", "戻る", ControlType.Button)
            ?? throw new InvalidOperationException(
                $"Dialog {DialogAutomationId} dang mo nhung khong thay nut btnF10 (戻る).");

        trace?.Note($"bam nut 「{Uia.NameOf(btn).Replace("\n", " ")}」 (btnF10)");
        Uia.MouseClick(btn);

        Waits.Until(() => !Uia.IsOnScreen(dialog),
                    "dialog frm203050 dong lai sau khi bam F10 戻る",
                    TimeSpan.FromSeconds(TestSettings.Current.Run.DefaultTimeoutSeconds));

        trace?.Note("dialog da dong");
    }

    /// <summary>Đọc số mục của <c>cboKind</c>.</summary>
    public static int ComboCount(Window dialog)
    {
        var cb = Uia.ById(dialog, CboKindId)
            ?? throw new InvalidOperationException(
                $"Dialog {DialogAutomationId} khong co cboKind.");
        var combo = cb.AsComboBox()
            ?? throw new InvalidOperationException(
                $"cboKind trong {DialogAutomationId} khong phai ComboBox theo UIA.");
        return combo.Items.Length;
    }

    /// <summary>
    /// Liệt kê 32 control <c>txtEpp1..txtEpp32</c> mà UIA đọc được.
    /// </summary>
    public static IReadOnlyList<string> TextBoxNames(Window dialog)
    {
        var names = new List<string>();
        for (var i = 1; i <= 32; i++)
        {
            var n = $"txtEpp{i}";
            var tb = Uia.ById(dialog, n);
            if (tb is not null) names.Add(n);
        }
        return names;
    }
}
