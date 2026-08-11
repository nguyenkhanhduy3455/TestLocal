using System.Text;
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

        trace?.Step("F11 → オプション > Step");

        // 1) Mở menu bằng cách invoke btnF11 + đảm bảo form ở (0,0) để popup không bị IDE che.
        OpenMenuByF11(app, screen, trace);

        // 1b) Diagnostics
        var afterDump = DumpAllTopLevelWindows(app);
        WriteArtifact("steps-edit-after-f11.uia.txt", afterDump);

        // 2) Popup menu phải hiện ra. Đợi tối đa 3s.
        var popup = WaitForContextMenuPopup(app, trace);
        if (popup is null)
            throw new InvalidOperationException(
                "F11 da click nhung khong thay popup menu nao. " +
                "Xem file: steps-edit-after-f11.uia.txt");

        trace?.Note($"popup menu ClassName='{Uia.ClassNameOf(popup)}' " +
                    $"Name='{Uia.NameOf(popup)}'");

        var dump = Uia.DumpTree(popup, maxDepth: 4, maxChildrenPerNode: 30);
        WriteArtifact("steps-edit-contextmenu.uia.txt", dump);

        // 3) Tìm mục オプション trong popup. Có thể là MenuItem ở cấp 1.
        var optionItem = FindMenuItemByText(popup, "オプション")
            ?? FindMenuItemByText(popup, "9 ");
        if (optionItem is null)
            throw new InvalidOperationException(
                "Da mo context menu nhung khong thay muc 「オプション」. " +
                "Xem file: steps-edit-contextmenu.uia.txt.");

        trace?.Note($"Hover + Click 「{Uia.NameOf(optionItem)}」");
        var (ox, oy) = Uia.Center(optionItem);

        // 3a) Di chuyển chuột + click để focus mục オプション
        Uia.MoveCursorTo(ox, oy);
        Thread.Sleep(200);
        Uia.LeftClickPhysical(ox, oy);
        Thread.Sleep(400);

        // 3b) Dump submenu ngay để xem có bung không (debug)
        var subDumpAtClick = DumpAllTopLevelWindows(app);
        WriteArtifact("steps-edit-after-click-option.uia.txt", subDumpAtClick);

        // 3c) Right Arrow — WinForms nav key để bung DropDown của mục đang focus.
        // Click chuột trái 1 lần lên mục có DropDownItems thường KHÔNG tự bung submenu
        // (WinForms ContextMenuStrip mặc định cần nav key như Right Arrow).
        Uia.SendKey(Uia.VK_RIGHT);
        Thread.Sleep(500);

        var subDumpAfterArrow = DumpAllTopLevelWindows(app);
        WriteArtifact("steps-edit-after-right-arrow.uia.txt", subDumpAfterArrow);

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

    /// <summary>
    /// Mở <c>contextMenuStripSentaku</c> bằng phím F11.
    ///
    /// <para>Source <c>frm203002.cs:920-965</c> <c>btnF11_Click</c>: gọi thẳng
    /// <c>contextMenuStripSentaku.Show()</c> tại vị trí dưới nút <c>btnF11</c>.
    /// Đây là cách mở menu trong app — KHÔNG cần RightClick (DataGridView ContextMenuStrip
    /// hay bị nuốt bởi cell edit mode, DPI, focus issue).</para>
    ///
    /// <para><b>Vì sao dùng bàn phím chứ không phải click chuột.</b> Trên máy có cửa sổ
    /// khác (IDE, File Explorer) che lên trên app, <c>SetCursorPos + mouse_event</c>
    /// vẫn gửi được, NHƯNG <c>contextMenuStripSentaku.Show(x, y)</c> hiển thị menu tại
    /// toạ độ màn hình — nếu cửa sổ khác đang topmost, menu có thể bị che. Gửi phím
    /// F11 đi qua message queue của tiến trình đang focused → app nhận và tự tính
    /// vị trí menu (vẫn theo <c>PointToScreen</c> của nó — nhưng app focus thì menu
    /// sẽ hiện ngay dưới btnF11 trong form).</para>
    /// </summary>
    private static void OpenMenuByF11(OchaApp app, Window screen, TestTrace? trace)
    {
        var btnF11 = Uia.ByIdOrName(screen, "btnF11", "選択", ControlType.Button)
            ?? throw new InvalidOperationException(
                "frm203002 khong co btnF11 (選択).");

        // Di chuyển form sang góc trên-trái (0,0) — tránh IDE (Antigravity / Chrome /
        // File Explorer) đang topmost ở các vị trí khác che popup context menu. Code
        // Show(x, y) của app tính theo Parent.PointToScreen — nếu form bị dời, popup
        // sẽ theo, không nằm dưới IDE.
        IntPtr hwnd = IntPtr.Zero;
        try
        {
            hwnd = screen.Properties.NativeWindowHandle.ValueOrDefault;
            if (hwnd != IntPtr.Zero)
            {
                Uia.MoveWindow(hwnd, x: 0, y: 0, keepSize: true);
                Thread.Sleep(100);
                // Bỏ topmost để các dialog sau hiện bình thường, nhưng vẫn ÉP foreground.
                Uia.SetWindowTopmost(hwnd, on: true);
                Thread.Sleep(50);
                Uia.SetWindowTopmost(hwnd, on: false);
                Uia.ForceForeground(hwnd);
            }
        }
        catch (Exception ex) { trace?.Note($"Focus warning: {ex.Message}"); }

        try { screen.Focus(); } catch { /* */ }
        Thread.Sleep(150);

        var (fx, fy) = Uia.Center(btnF11);
        trace?.Note($"Invoke UIA btnF11 tai center=({fx},{fy})");

        // Gọi handler — đồng bộ trong process, Show() chạy ngay.
        Uia.Click(btnF11);

        var dump = DumpAllTopLevelWindows(app);
        WriteArtifact("steps-edit-immediately-after-invoke.uia.txt", dump);
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
    /// desktop root lẫn app process. ContextMenuStrip của WinForms tạo cửa sổ
    /// top-level thuộc process của form — KHÔNG nằm ở <c>GetDesktop</c> root trong
    /// một số trường hợp, mà nằm trong <c>app.Windows()</c>.
    /// </summary>
    private static AutomationElement? FindAnyContextMenuPopup(OchaApp app)
    {
        // Nguồn 1: desktop — popup Windows quản lý (ClassName #32768).
        try
        {
            var desktop = OchaApp.SharedAutomation.GetDesktop();
            foreach (var m in desktop.FindAllChildren(cf => cf.ByClassName("#32768")))
            {
                try { if (Uia.IsOnScreen(m)) return m; }
                catch { /* vừa đóng */ }
            }
        }
        catch { /* */ }

        // Nguồn 2: cửa sổ top-level của app, lọc ControlType.Menu.
        try
        {
            foreach (var w in app.Windows())
            {
                try
                {
                    if (w.ControlType == ControlType.Menu) return w;
                }
                catch { /* bỏ qua */ }
            }
        }
        catch { /* */ }

        // Nguồn 3 (mở rộng): mọi window top-level của app — bao gồm cả những
        // popup ContextMenuStrip có className riêng. Lọc theo tên/kiểu.
        try
        {
            foreach (var w in app.Windows())
            {
                try
                {
                    var name = Uia.NameOf(w);
                    if (Txt.Has(name, "オプション") || Txt.Has(name, "Step") ||
                        Txt.Has(name, "選択") || Txt.Has(name, "コピー"))
                        return w;
                }
                catch { /* */ }
            }
        }
        catch { /* */ }

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
    /// Dump mọi cửa sổ top-level mà Windows thấy — bao gồm cả popup menu
    /// <c>#32768</c> và ContextMenuStrip. Trả về text để ghi artifact.
    /// </summary>
    private static string DumpAllTopLevelWindows(OchaApp app)
    {
        var sb = new StringBuilder();
        var desktop = OchaApp.SharedAutomation.GetDesktop();
        var all = desktop.FindAllChildren();
        sb.AppendLine($"== So phan tu top-level tren desktop: {all.Length} ==");
        foreach (var el in all)
        {
            try
            {
                var r = el.BoundingRectangle;
                var ct = Uia.ControlTypeOf(el)?.ToString() ?? "?";
                sb.AppendLine($"  [{ct}] id='{Uia.AutomationIdOf(el)}' " +
                              $"name='{Uia.NameOf(el)}' class='{Uia.ClassNameOf(el)}' " +
                              $"@({r.X},{r.Y} {r.Width}x{r.Height})");
            }
            catch { /* có thể đang đóng */ }
        }
        return sb.ToString();
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
