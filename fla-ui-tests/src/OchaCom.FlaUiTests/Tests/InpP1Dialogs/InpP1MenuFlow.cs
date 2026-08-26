using System.Text;
using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.InpP1Dialogs;

/// <summary>
/// Lái đường tới hai dialog mở từ menu 「９ オプション」 của <c>frm203002</c>（診療入力）:
/// <c>frm203050</c>「Ｓｔｅｐ編集」 và <c>frm203044</c>「チェック項目設定」.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ĐƯỜNG ĐI
/// ═══════════════════════════════════════════════════════════════════════════
/// <c>frm203002.Designer.cs:2824-2838</c>: <c>IDM_Option</c> (Text "<c>&amp;9 オプション</c>")
/// có <c>DropDownItems</c> gồm <c>IDM_ChkPrm</c> ("<c>&amp;1 チェック項目設定</c>", :2840-2845)
/// … <c>IDM_Step</c> ("<c>Step</c>", :2897-2902). Menu này là <c>contextMenuStripSentaku</c>
/// và app tự mở nó trong <c>btnF11_Click</c> (frm203002.cs:920-965).
///
/// <para><b>Bám theo AutomationId, không phải chữ.</b> Cầu MSAA→UIA của WinForms lấy
/// AutomationId của <c>ToolStripMenuItem</c> từ <c>Control.Name</c> ⇒ <c>IDM_Step</c> /
/// <c>IDM_ChkPrm</c> là khoá ổn định, trong khi Text còn dính ký tự tăng tốc
/// (<c>&amp;9</c>) và có thể bị khách sửa. Vẫn giữ đường dự phòng theo chữ.</para>
///
/// <para><b>Vì sao không dùng phím tắt.</b> 「Step」 không có <c>ShortcutKeys</c>, và
/// 「オプション」 là <c>ContextMenuStrip</c> chứ không phải menu bar dock Top nên Alt+9
/// không đáng tin. Mở menu bằng cách gọi <c>btnF11</c>, rồi đi bằng chuột + phím mũi tên.</para>
/// </summary>
public static class InpP1MenuFlow
{
    /// <summary>Một mục trong submenu 「９ オプション」 và dialog mà nó mở ra.</summary>
    /// <param name="MenuItemId">AutomationId của <c>ToolStripMenuItem</c> (= Control.Name).</param>
    /// <param name="MenuItemText">Chữ trên mục menu — đường dự phòng khi UIA không có AutomationId.</param>
    /// <param name="DialogId">AutomationId của dialog (= tên class form).</param>
    /// <param name="TitleFragment">Chuỗi phải có trong tiêu đề dialog (<c>_title</c> của form).</param>
    /// <param name="ReadyControlId">Control chứng tỏ <c>initProc()</c> đã nạp xong.</param>
    public sealed record OptionItem(
        string MenuItemId,
        string MenuItemText,
        string DialogId,
        string TitleFragment,
        string ReadyControlId);

    /// <summary>frm203050 — <c>IDM_Step_Click</c> (frm203002.cs:8011-8015).</summary>
    public static readonly OptionItem StepEdit =
        new("IDM_Step", "Step", "frm203050", "Ｓｔｅｐ編集", "cboKind");

    /// <summary>frm203044 — <c>IDM_ChkPrm_Click</c>.</summary>
    public static readonly OptionItem CheckItem =
        new("IDM_ChkPrm", "チェック項目設定", "frm203044", "チェック項目設定", "cboParam01");

    private const string OptionMenuId = "IDM_Option";
    private const string OptionMenuText = "オプション";

    // ─────────────────────────────────────────────────────────────────────────
    // Mở dialog
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Mở dialog của <paramref name="item"/> từ menu オプション và chờ nó nạp xong.
    ///
    /// <para>Dialog đang mở sẵn thì trả về luôn — các testcase nối tiếp nhau trong một
    /// fixture, testcase trước có thể đã để dialog mở.</para>
    /// </summary>
    public static Window Open(OchaApp app, Window screen, OptionItem item, TestTrace? trace = null)
    {
        var already = app.Window(item.DialogId);
        if (already is not null)
        {
            trace?.Note($"dialog {item.DialogId} da mo san — dung lai");
            return already;
        }

        trace?.Step($"F11 → 「９ オプション」 → 「{item.MenuItemText}」");

        OpenMenuByF11(app, screen, trace);

        var popup = WaitForContextMenuPopup(app)
            ?? throw new InvalidOperationException(
                "Da goi btnF11 nhung khong thay popup menu nao. Xem artifact " +
                "inp-p1-after-f11.uia.txt — chay lai voi -Diagnostics de co cay UIA day du.");

        trace?.Note($"popup menu class='{Uia.ClassNameOf(popup)}' name='{Uia.NameOf(popup)}'");
        WriteArtifact("inp-p1-contextmenu.uia.txt", Uia.DumpTree(popup, maxDepth: 4, maxChildrenPerNode: 40));

        // 1) 「オプション」 — click để focus, rồi Right Arrow để bung DropDown.
        //    Một click trái lên mục có DropDownItems KHÔNG tự bung submenu trong
        //    ContextMenuStrip của WinForms; phím điều hướng mới bung.
        var optionItem = FindMenuItem(popup, OptionMenuId, OptionMenuText)
            ?? throw new InvalidOperationException(
                $"Popup menu da mo nhung khong thay muc 「{OptionMenuText}」 ({OptionMenuId}). " +
                "Xem artifact inp-p1-contextmenu.uia.txt.");

        var (ox, oy) = Uia.Center(optionItem);
        Uia.MoveCursorTo(ox, oy);
        Thread.Sleep(200);
        Uia.LeftClickPhysical(ox, oy);
        Thread.Sleep(300);
        Uia.SendKey(Vk.Right);
        Thread.Sleep(400);

        // 2) Mục con. Tìm trong MỌI popup đang mở — submenu là cửa sổ #32768 RIÊNG,
        //    không phải con của popup cha, nên tìm trong popup cha sẽ trượt.
        var target = Waits.For(() => FindMenuItemAnywhere(app, item.MenuItemId, item.MenuItemText),
                               $"muc menu 「{item.MenuItemText}」 ({item.MenuItemId}) trong submenu オプション",
                               TimeSpan.FromSeconds(8));

        trace?.Note($"click 「{Uia.NameOf(target)}」");
        var (sx, sy) = Uia.Center(target);
        Uia.LeftClickPhysical(sx, sy);
        Waits.Step();

        // 3) Cửa sổ dialog.
        var timeout = TestSettings.Current.Run.DefaultTimeout;
        var dialog = Waits.For(() => app.Window(item.DialogId),
                               $"dialog {item.DialogId} hien len sau khi click 「{item.MenuItemText}」",
                               timeout);

        // 4) initProc() xong chưa. Cả hai form đều nạp combo từ CODMST trong initProc
        //    (frm203050.cs:204 / frm203044.cs:134-158); combo còn rỗng nghĩa là chưa xong.
        WaitUntilComboFilled(dialog, item, timeout);

        trace?.Shot($"{item.DialogId}-mo");
        return dialog;
    }

    private static void WaitUntilComboFilled(Window dialog, OptionItem item, TimeSpan timeout)
    {
        var filled = Waits.TryUntil(() => ComboItemCount(dialog, item.ReadyControlId) > 0, timeout);
        if (filled) return;

        throw new InvalidOperationException(
            $"Dialog {item.DialogId} da mo nhung 「{item.ReadyControlId}」 van rong sau " +
            $"{timeout.TotalSeconds:0}s — initProc() chua nap xong. Kiem bang CODMST " +
            "co du lieu cho cd_type tuong ung khong (70 cho frm203050; 62/63/64 cho frm203044).");
    }

    /// <summary>Số mục của một ComboBox; không thấy control hoặc chưa nạp → 0.</summary>
    public static int ComboItemCount(AutomationElement scope, string automationId)
    {
        try
        {
            var combo = Uia.ById(scope, automationId)?.AsComboBox();
            return combo?.Items.Length ?? 0;
        }
        catch
        {
            return 0;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Đóng dialog
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Đóng dialog bằng <b>phím F10</b> 戻る.
    ///
    /// <para><b>Phím chứ không phải click.</b> <c>BaseDialog.KeyPreview = true</c>
    /// (BaseDialog.cs:139) nên F10 tới thẳng <c>formBase_KeyDown</c> → <c>btnF10_Click</c>
    /// → <c>this.Close()</c> (BaseDialog.cs:308-312, :347-350) bất kể đang focus ở đâu.
    /// Click chuột thì phải rời focus khỏi ô đang sửa — mà <c>txtEpp_Leave</c> của
    /// frm203050 lại <b>ép focus quay lại</b> khi ô &gt; 30000 (frm203050.cs:179-186),
    /// nên cú click có thể bị nuốt.</para>
    ///
    /// <para><b>TUYỆT ĐỐI không dùng ESC.</b> Trong <c>BaseDialog</c>, <c>Keys.Escape</c>
    /// và <c>Keys.End</c> đều gọi <c>btnF9_Click</c> (BaseDialog.cs:314-325) — tức là
    /// 確定/登録, GHI DỮ LIỆU. ESC ở app này không phải "huỷ".</para>
    /// </summary>
    public static void CloseByBack(OchaApp app, Window dialog, string dialogId, TestTrace? trace = null)
    {
        if (!Uia.IsOnScreen(dialog)) return;

        trace?.Step($"dong {dialogId} bang F10 戻る");
        Focus(dialog);
        Uia.SendKey(Vk.F10);

        var closed = Waits.TryUntil(() => app.Window(dialogId) is null,
                                    TestSettings.Current.Run.DefaultTimeout);
        if (closed)
        {
            trace?.Note("dialog da dong");
            return;
        }

        // Dự phòng: bấm nút btnF10 thật.
        trace?.Note("F10 bang phim khong an — thu click nut btnF10");
        var btn = Uia.ByIdOrName(dialog, "btnF10", "戻る", ControlType.Button);
        if (btn is not null) Uia.MouseClick(btn);

        Waits.Until(() => app.Window(dialogId) is null,
                    $"dialog {dialogId} dong lai sau khi bam F10 戻る",
                    TestSettings.Current.Run.DefaultTimeout);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Tiện ích dùng chung cho cả ba dialog
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Đưa cửa sổ lên foreground rồi focus. Bắt buộc trước mỗi lần gửi phím:
    /// <c>SendInput</c> gửi tới cửa sổ ĐANG foreground, không phải tới đối tượng UIA.
    /// </summary>
    public static void Focus(Window window)
    {
        try
        {
            var hwnd = window.Properties.NativeWindowHandle.ValueOrDefault;
            if (hwnd != IntPtr.Zero) Uia.ForceForeground(hwnd);
        }
        catch { /* cửa sổ bận — vẫn thử Focus() bên dưới */ }

        try { window.Focus(); } catch { /* không quan trọng */ }
        Thread.Sleep(120);
    }

    /// <summary>
    /// Nút F-key của <c>BaseDialog</c> theo AutomationId <c>btnF9</c> / <c>btnF10</c>.
    /// Dùng để đọc <c>Enabled</c> — <c>btnChgEnable</c> (BaseDialog.cs:160-186) là cách
    /// duy nhất WinForm "tắt" một chức năng, nó KHÔNG ẩn nút đi.
    /// </summary>
    public static AutomationElement? FButton(Window dialog, string id) => Uia.ById(dialog, id);

    /// <summary>
    /// Đọc rồi ĐÓNG hộp cảnh báo (<c>MsgDialog.ShowErrorMsg</c> → MessageBox #32770).
    /// Trả về nội dung; không có hộp nào trong <paramref name="timeout"/> → null.
    ///
    /// <para>Phải đọc và đóng NGAY: MessageBox là modal, luồng UI của app bị chặn bên
    /// trong <c>MessageBox.Show</c> nên mọi truy vấn UIA lên form phía sau sẽ treo tới
    /// hết timeout (xem chú thích đầu <see cref="ModalDialogs"/>).</para>
    /// </summary>
    public static string? ReadAndDismissError(OchaApp app, Window owner, TimeSpan timeout)
    {
        var hit = Waits.TryFor(() => FirstMessageBox(app, owner), timeout);
        if (hit is null) return null;

        var text = Txt.N(Dialogs.TextOf(hit));
        Dialogs.DismissOk(hit, DismissTimeout);
        return text;
    }

    /// <summary>
    /// Hạn chờ hộp thoại ĐÓNG HẲN sau khi bấm OK. Dài hơn <c>run.defaultTimeoutSeconds</c>
    /// rất nhiều là CÓ CHỦ Ý: chừng nào MessageBox còn mở, luồng UI của app còn bị chặn
    /// nên mỗi vòng poll UIA tốn hàng giây — 20s mặc định trôi qua chỉ sau vài vòng.
    /// (Cùng lý do với <c>parity.dialogTimeoutSeconds</c>.)
    /// </summary>
    private static readonly TimeSpan DismissTimeout = TimeSpan.FromSeconds(90);

    /// <summary>Có hộp cảnh báo nào đang mở không (không đóng nó).</summary>
    public static string? PeekError(OchaApp app, Window owner)
    {
        var hit = FirstMessageBox(app, owner);
        return hit is null ? null : Txt.N(Dialogs.TextOf(hit));
    }

    private static Window? FirstMessageBox(OchaApp app, Window owner)
    {
        foreach (var w in ModalDialogs.All(app, owner))
        {
            try
            {
                if (Uia.ClassNameOf(w) != Dialogs.Win32DialogClass) continue;
                if (!Uia.IsOnScreen(w)) continue;
                return w;
            }
            catch { /* vừa đóng */ }
        }
        return null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Menu — chi tiết bên trong
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Mở <c>contextMenuStripSentaku</c> bằng cách gọi <c>btnF11</c>.
    ///
    /// <para>Dời form về (0,0) trước: <c>btnF11_Click</c> gọi
    /// <c>contextMenuStripSentaku.Show(x, y)</c> theo toạ độ MÀN HÌNH; nếu cửa sổ khác
    /// (IDE, File Explorer) đang topmost ở vị trí đó thì popup bị che và mọi cú click
    /// sau rơi vào cửa sổ kia.</para>
    /// </summary>
    /// <summary>
    /// Mở menu F11 rồi click một mục Ở TẦNG ĐẦU (không phải mục con của 「９ オプション」).
    ///
    /// <para>Dùng cho <c>IDM_AccDataOnly</c> 「＆3 会計データ作成」 — mục này nằm thẳng
    /// trong popup, cạnh <c>IDM_Option</c>, nên không cần bước Right Arrow bung submenu
    /// như <see cref="Open"/>.</para>
    /// </summary>
    /// <returns>false khi không mở được menu hoặc không thấy mục.</returns>
    public static bool ClickTopLevelItem(
        OchaApp app, Window screen, string menuItemId, string menuItemText, TestTrace? trace = null)
    {
        trace?.Step($"F11 → 「{menuItemText}」");
        OpenMenuByF11(app, screen, trace);

        var popup = WaitForContextMenuPopup(app);
        if (popup is null)
        {
            trace?.Note("KHONG thay popup menu nao sau khi bam F11");
            return false;
        }

        var item = FindMenuItem(popup, menuItemId, menuItemText)
                   ?? FindMenuItemAnywhere(app, menuItemId, menuItemText);
        if (item is null)
        {
            trace?.Note($"popup da mo nhung khong thay muc 「{menuItemText}」 ({menuItemId})");
            return false;
        }

        var (x, y) = Uia.Center(item);
        trace?.Note($"click 「{Uia.NameOf(item)}」");
        Uia.MoveCursorTo(x, y);
        Thread.Sleep(200);
        Uia.LeftClickPhysical(x, y);
        Waits.Step();
        return true;
    }

    private static void OpenMenuByF11(OchaApp app, Window screen, TestTrace? trace)
    {
        var btnF11 = Uia.ByIdOrName(screen, "btnF11", "選択", ControlType.Button)
            ?? throw new InvalidOperationException("frm203002 khong co btnF11 (選択).");

        try
        {
            var hwnd = screen.Properties.NativeWindowHandle.ValueOrDefault;
            if (hwnd != IntPtr.Zero)
            {
                Uia.MoveWindow(hwnd, x: 0, y: 0, keepSize: true);
                Thread.Sleep(100);
                Uia.SetWindowTopmost(hwnd, on: true);
                Thread.Sleep(50);
                Uia.SetWindowTopmost(hwnd, on: false);
                Uia.ForceForeground(hwnd);
            }
        }
        catch (Exception ex) { trace?.Note($"canh bao khi dua frm203002 len foreground: {ex.Message}"); }

        try { screen.Focus(); } catch { /* */ }
        Thread.Sleep(150);

        Uia.Click(btnF11);
        WriteArtifact("inp-p1-after-f11.uia.txt", DumpAllTopLevelWindows(app));
    }

    /// <summary>Mục menu theo AutomationId, không có thì theo chữ.</summary>
    private static AutomationElement? FindMenuItem(AutomationElement root, string automationId, string text)
    {
        AutomationElement[] items;
        try { items = root.FindAllDescendants(cf => cf.ByControlType(ControlType.MenuItem)); }
        catch { return null; }

        return items.FirstOrDefault(i => Txt.Same(Uia.AutomationIdOf(i), automationId))
            ?? items.FirstOrDefault(i => Txt.Has(Uia.NameOf(i).Replace("&", ""), text));
    }

    /// <summary>Tìm mục menu trong MỌI popup đang mở (cha lẫn submenu).</summary>
    private static AutomationElement? FindMenuItemAnywhere(OchaApp app, string automationId, string text)
    {
        foreach (var popup in AllContextMenuPopups(app))
        {
            var hit = FindMenuItem(popup, automationId, text);
            if (hit is not null && Uia.IsOnScreen(hit)) return hit;
        }
        return null;
    }

    private static AutomationElement? WaitForContextMenuPopup(OchaApp app) =>
        Waits.TryFor(() => AllContextMenuPopups(app).FirstOrDefault(), TimeSpan.FromSeconds(5));

    /// <summary>
    /// Mọi cửa sổ popup menu đang hiện. Đi qua CẢ desktop (popup do Windows quản lý,
    /// ClassName <c>#32768</c>) lẫn cửa sổ top-level của app (<c>ContextMenuStrip</c> của
    /// .NET tạo cửa sổ thuộc tiến trình form, không phải lúc nào cũng nằm dưới desktop root).
    /// </summary>
    private static IEnumerable<AutomationElement> AllContextMenuPopups(OchaApp app)
    {
        var found = new List<AutomationElement>();

        try
        {
            var desktop = OchaApp.SharedAutomation.GetDesktop();
            foreach (var m in desktop.FindAllChildren(cf => cf.ByClassName("#32768")))
            {
                try { if (Uia.IsOnScreen(m)) found.Add(m); }
                catch { /* vừa đóng */ }
            }
        }
        catch { /* desktop bận */ }

        try
        {
            foreach (var w in app.Windows())
            {
                try { if (w.ControlType == ControlType.Menu) found.Add(w); }
                catch { /* */ }
            }
        }
        catch { /* */ }

        return found;
    }

    internal static void WriteArtifact(string fileName, string content)
    {
        try
        {
            var outDir = TestSettings.Current.Run.ScreenshotDir;
            var fullDir = Path.IsPathRooted(outDir)
                ? outDir
                : Path.Combine(AppContext.BaseDirectory, outDir);
            Directory.CreateDirectory(fullDir);
            File.WriteAllText(Path.Combine(fullDir, fileName), content);
        }
        catch { /* ghi artifact hỏng thì cũng không được làm hỏng testcase */ }
    }

    internal static string DumpAllTopLevelWindows(OchaApp app)
    {
        var sb = new StringBuilder();
        try
        {
            var all = OchaApp.SharedAutomation.GetDesktop().FindAllChildren();
            sb.AppendLine($"== So phan tu top-level tren desktop: {all.Length} ==");
            foreach (var el in all)
            {
                try
                {
                    var r = el.BoundingRectangle;
                    sb.AppendLine($"  [{Uia.ControlTypeOf(el)?.ToString() ?? "?"}] " +
                                  $"id='{Uia.AutomationIdOf(el)}' name='{Uia.NameOf(el)}' " +
                                  $"class='{Uia.ClassNameOf(el)}' @({r.X},{r.Y} {r.Width}x{r.Height})");
                }
                catch { /* có thể đang đóng */ }
            }
        }
        catch (Exception e) { sb.AppendLine($"khong doc duoc desktop: {e.Message}"); }
        return sb.ToString();
    }
}
