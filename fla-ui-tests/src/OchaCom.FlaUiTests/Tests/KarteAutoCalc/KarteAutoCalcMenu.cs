using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using OchaCom.FlaUiTests.App;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.KarteAutoCalc;

/// <summary>
/// Mở menu 「９ オプション」 của <c>frm203002</c> và chọn một mục con — bản RIÊNG của
/// luồng カルテ自動算定.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÌ SAO KHÔNG DÙNG <c>InpP1MenuFlow.Open</c>
/// ═══════════════════════════════════════════════════════════════════════════
/// Hai lý do, cả hai đều rút ra từ lần chạy thật đầu tiên (2026-08-11):
///
/// 1. <b>Nó dời cửa sổ về (0,0)</b> trước khi bấm F11. Chủ máy cho biết việc đó
///    không cần: app để sát mép dưới thì popup vẫn tự lật lên trên. Dời cửa sổ là
///    tác dụng phụ không ai yêu cầu — nó xáo trộn bố cục màn hình của người đang
///    ngồi xem, và nếu ai đó đặt app ở vị trí có chủ đích thì test phá mất.
///
/// 2. <b>Nó ném ngay khi không thấy popup</b>, nên một lần chạy chỉ nói được
///    「không thấy popup」 mà không nói vì sao. Bản ở đây trả về null kèm lý do để
///    <c>Tc0</c> in ra rồi đi tiếp.
///
/// <para>Bản thân <c>InpP1MenuFlow</c> cũng chưa từng chạy trên Windows, nên phụ
/// thuộc vào nó là đặt cược luồng mới vào code chưa kiểm chứng. Phần khó thì vẫn
/// chép lại y nguyên (xem hai ghi chú dưới) — cái đáng học thì học, cái chưa chắc
/// thì không kế thừa.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// HAI CHỖ DỄ SAI, GIỮ NGUYÊN CÁCH LÀM CỦA InpP1MenuFlow
/// ═══════════════════════════════════════════════════════════════════════════
///  · Click trái lên mục có DropDownItems <b>KHÔNG</b> tự bung submenu trong
///    <c>ContextMenuStrip</c> của WinForms — phải bấm phím Right sau khi focus.
///  · Submenu là cửa sổ <c>#32768</c> <b>RIÊNG</b>, không phải con của popup cha ⇒
///    tìm mục con trong popup cha sẽ trượt; phải quét mọi popup đang mở.
/// </summary>
internal static class KarteAutoCalcMenu
{
    /// <summary>AutomationId / chữ của mục cha 「９ オプション」.</summary>
    private const string OptionMenuId = "IDM_Option";
    private const string OptionMenuText = "オプション";

    /// <summary>Kết quả mở menu — <see cref="Popup"/> null thì <see cref="Reason"/> nói vì sao.</summary>
    internal sealed record MenuOpenResult(AutomationElement? Popup, string Reason);

    /// <summary>
    /// Bấm <c>btnF11</c> để bung <c>contextMenuStripSentaku</c>.
    ///
    /// <para><b>Không dời cửa sổ.</b> Chỉ đưa nó lên foreground — popup của WinForms
    /// tự lật lên/xuống cho vừa màn hình, kể cả khi app nằm sát mép dưới.</para>
    /// </summary>
    public static MenuOpenResult OpenSentakuMenu(OchaApp app, Window screen, TestTrace? trace = null)
    {
        // Bề RỘNG, không phải Uia.ByIdOrName: gốc tìm ở đây là frm203002 với lưới
        // 診療 tới 2.864 dòng, duyệt sâu lún vào đó mất 10-20s mỗi lần gọi
        // (đo 2026-08-11 trên luồng InpP23Parity: [01] 15.2s, [04] 22s).
        var btnF11 = KarteAutoCalcDialog.FindChromeIdOrName(screen, "btnF11", "選択");
        if (btnF11 is null)
            return new(null, "man dang mo khong co btnF11 (選択) — co phai frm203002 khong?");

        // Foreground thôi, KHÔNG MoveWindow: popup bị che chỉ xảy ra khi cửa sổ khác
        // nằm đè, và ForceForeground đã xử lý đúng cái đó.
        try
        {
            var hwnd = screen.Properties.NativeWindowHandle.ValueOrDefault;
            if (hwnd != IntPtr.Zero) Uia.ForceForeground(hwnd);
        }
        catch (Exception ex) { trace?.Note($"canh bao khi dua form len foreground: {ex.Message}"); }

        try { screen.Focus(); } catch { /* */ }
        Thread.Sleep(150);

        trace?.Step("bam btnF11 (khong doi vi tri cua so)");
        try { Uia.Click(btnF11); }
        catch (Exception ex) { return new(null, $"click btnF11 loi: {ex.Message}"); }

        var popup = Waits.TryFor(() => AllPopups(app).FirstOrDefault(), TimeSpan.FromSeconds(5));
        return popup is null
            ? new(null, "bam btnF11 xong nhung khong thay cua so popup menu nao trong 5s")
            : new(popup, "ok");
    }

    /// <summary>
    /// Bung submenu 「オプション」 rồi click mục con <paramref name="itemId"/>.
    /// Trả về false kèm lý do thay vì ném.
    /// </summary>
    public static bool ClickOptionSubItem(
        OchaApp app, AutomationElement popup, string itemId, string itemText,
        out string reason, TestTrace? trace = null)
    {
        var optionItem = FindMenuItem(popup, OptionMenuId, OptionMenuText);
        if (optionItem is null)
        {
            reason = $"popup da mo nhung khong thay muc 「{OptionMenuText}」 ({OptionMenuId})";
            return false;
        }

        // Focus bằng chuột rồi Right để bung — click trái không bung DropDown.
        var (ox, oy) = Uia.Center(optionItem);
        Uia.MoveCursorTo(ox, oy);
        Thread.Sleep(200);
        Uia.LeftClickPhysical(ox, oy);
        Thread.Sleep(300);
        Uia.SendKey(Vk.Right);
        Thread.Sleep(400);
        trace?.Step($"bung submenu 「{OptionMenuText}」");

        var target = Waits.TryFor(() => FindMenuItemAnywhere(app, itemId, itemText),
                                  TimeSpan.FromSeconds(8));
        if (target is null)
        {
            reason = $"submenu da bung nhung khong thay muc 「{itemText}」 ({itemId})";
            return false;
        }

        var (sx, sy) = Uia.Center(target);
        Uia.LeftClickPhysical(sx, sy);
        Waits.Step();
        reason = "ok";
        return true;
    }

    /// <summary>Mục menu theo AutomationId, không có thì theo chữ (bỏ ký tự tăng tốc &amp;).</summary>
    public static AutomationElement? FindMenuItem(AutomationElement root, string automationId, string text)
    {
        AutomationElement[] items;
        try { items = root.FindAllDescendants(cf => cf.ByControlType(ControlType.MenuItem)); }
        catch { return null; }

        return items.FirstOrDefault(i => Txt.Same(Uia.AutomationIdOf(i), automationId))
            ?? items.FirstOrDefault(i => Txt.Has(Uia.NameOf(i).Replace("&", ""), text));
    }

    /// <summary>Tìm trong MỌI popup đang mở — submenu là cửa sổ riêng, không phải con của popup cha.</summary>
    public static AutomationElement? FindMenuItemAnywhere(OchaApp app, string automationId, string text)
    {
        foreach (var popup in AllPopups(app))
        {
            var hit = FindMenuItem(popup, automationId, text);
            if (hit is not null && Uia.IsOnScreen(hit)) return hit;
        }
        return null;
    }

    /// <summary>
    /// Mọi cửa sổ popup menu đang hiện: quét CẢ desktop (<c>#32768</c> do Windows
    /// quản lý) lẫn cửa sổ top-level của app (<c>ContextMenuStrip</c> của .NET tạo
    /// cửa sổ thuộc tiến trình form, không phải lúc nào cũng nằm dưới desktop root).
    ///
    /// <para><b>Lọc theo processId.</b> <c>#32768</c> là lớp popup CHUNG của Windows —
    /// mọi app đều dùng. Lần chạy 2026-08-11 quét được cả menu của VS Code đang mở
    /// bên cạnh (File / Edit / View / Terminal…). Không lọc thì
    /// <see cref="FindMenuItemAnywhere"/> có thể trúng mục menu của app KHÁC và test
    /// đi bấm nhầm vào đó.</para>
    /// </summary>
    public static IEnumerable<AutomationElement> AllPopups(OchaApp app)
    {
        var found = new List<AutomationElement>();
        var pid = app.ProcessId;

        try
        {
            foreach (var m in OchaApp.SharedAutomation.GetDesktop()
                                     .FindAllChildren(cf => cf.ByClassName("#32768")))
            {
                try
                {
                    if (m.Properties.ProcessId.ValueOrDefault != pid) continue;
                    if (Uia.IsOnScreen(m)) found.Add(m);
                }
                catch { /* vừa đóng */ }
            }
        }
        catch { /* desktop bận */ }

        try
        {
            foreach (var w in app.Windows())
            {
                try
                {
                    if (!Uia.IsOnScreen(w)) continue;
                    if (Uia.ClassNameOf(w).Contains("32768")) { found.Add(w); continue; }
                    // ContextMenuStrip lồng trong cửa sổ app: có MenuItem con là đủ dấu hiệu.
                    if (w.FindAllDescendants(cf => cf.ByControlType(ControlType.MenuItem)).Length > 0)
                        found.Add(w);
                }
                catch { /* vừa đóng */ }
            }
        }
        catch { /* app bận */ }

        return found;
    }
}
