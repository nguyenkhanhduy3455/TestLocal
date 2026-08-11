using System.Runtime.InteropServices;
using System.Text;
using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;

namespace OchaCom.FlaUiTests.Infrastructure;

/// <summary>
/// Lớp mỏng trên FlaUI: tìm phần tử, đọc/ghi text, đổ cây UIA.
///
/// ─── Vì sao tìm theo AutomationId ────────────────────────────────────────────
/// App là WinForms nên cầu MSAA→UIA lấy AutomationId từ `Control.Name` (vd
/// `txtKobeSearchCode`, `hfgKobetu`). Đó là khoá ỔN ĐỊNH nhất: nhãn hiển thị có thể
/// đổi theo cấu hình/ngôn ngữ, còn tên control chỉ đổi khi ai đó sửa Designer.
///
/// Nhưng KHÔNG chắc 100% mọi bản Windows đều gắn AutomationId cho control WinForms
/// .NET 3.5, nên mọi hàm tìm ở đây đều có ĐƯỜNG DỰ PHÒNG (Name, ControlType, vị trí).
/// Nếu máy Windows chạy ra sai, chạy `UiaTreeDumpTests` để đổ cây thật rồi chỉnh mục
/// "locators" trong testsettings.json — không phải sửa code.
/// </summary>
public static class Uia
{
    /// <summary>Tìm hậu duệ theo AutomationId (không chờ).</summary>
    public static AutomationElement? ById(AutomationElement scope, string automationId) =>
        scope.FindFirstDescendant(cf => cf.ByAutomationId(automationId));

    /// <summary>Chờ tới khi thấy hậu duệ có AutomationId đó.</summary>
    public static AutomationElement RequireById(AutomationElement scope, string automationId, TimeSpan? timeout = null) =>
        Waits.For(() => ById(scope, automationId), $"control AutomationId=「{automationId}」", timeout);

    /// <summary>AutomationId trước, không có thì tới Name — dùng cho nút có chữ (vd 検索).</summary>
    public static AutomationElement? ByIdOrName(AutomationElement scope, string automationId, string name,
                                                ControlType? type = null)
    {
        var byId = ById(scope, automationId);
        if (byId is not null) return byId;

        return Descendants(scope)
            .FirstOrDefault(e => (type is null || ControlTypeOf(e) == type) && Txt.Same(NameOf(e), name));
    }

    public static AutomationElement RequireByIdOrName(AutomationElement scope, string automationId, string name,
                                                      ControlType? type = null, TimeSpan? timeout = null) =>
        Waits.For(() => ByIdOrName(scope, automationId, name, type),
                 $"control AutomationId=「{automationId}」 hoặc Name=「{name}」", timeout);

    // ── Đọc ──────────────────────────────────────────────────────────────────

    public static string NameOf(AutomationElement e)
    {
        try { return e.Properties.Name.ValueOrDefault ?? ""; }
        catch { return ""; }
    }

    public static string AutomationIdOf(AutomationElement e)
    {
        try { return e.Properties.AutomationId.ValueOrDefault ?? ""; }
        catch { return ""; }
    }

    public static string ClassNameOf(AutomationElement e)
    {
        try { return e.Properties.ClassName.ValueOrDefault ?? ""; }
        catch { return ""; }
    }

    public static ControlType? ControlTypeOf(AutomationElement e)
    {
        try { return e.Properties.ControlType.ValueOrDefault; }
        catch { return null; }
    }

    public static bool IsOnScreen(AutomationElement e)
    {
        try { return !e.Properties.IsOffscreen.ValueOrDefault; }
        catch { return false; }
    }

    /// <summary>
    /// Nội dung "thật" của một phần tử, thử theo thứ tự ValuePattern → LegacyIAccessible.Value
    /// → Name. Ô của DataGridView qua cầu MSAA để giá trị ở LegacyIAccessible.Value còn Name
    /// là tiêu đề cột, nên thứ tự này quan trọng.
    /// </summary>
    public static string ValueOf(AutomationElement e)
    {
        try
        {
            var value = e.Patterns.Value.PatternOrDefault;
            if (value is not null)
            {
                var v = value.Value.ValueOrDefault;
                if (!string.IsNullOrEmpty(v)) return v;
            }
        }
        catch { /* pattern không được hỗ trợ → thử cách khác */ }

        try
        {
            var legacy = e.Patterns.LegacyIAccessible.PatternOrDefault;
            if (legacy is not null)
            {
                var v = legacy.Value.ValueOrDefault;
                if (!string.IsNullOrEmpty(v)) return v;
            }
        }
        catch { /* nt */ }

        return NameOf(e);
    }

    /// <summary>Nhãn kèm theo phần tử (với ô lưới WinForms là TIÊU ĐỀ CỘT).</summary>
    public static string LegacyNameOf(AutomationElement e)
    {
        try
        {
            var legacy = e.Patterns.LegacyIAccessible.PatternOrDefault;
            var v = legacy?.Name.ValueOrDefault;
            if (!string.IsNullOrEmpty(v)) return v;
        }
        catch { /* bỏ qua */ }

        return NameOf(e);
    }

    // ── Ghi ──────────────────────────────────────────────────────────────────

    /// <summary>
    /// Gán nội dung ô nhập bằng BÀN PHÍM chứ không phải ValuePattern.SetValue.
    ///
    /// SetValue nhét thẳng vào control, KHÔNG sinh KeyDown/KeyPress — mà mấy ô của
    /// frm203002 lại treo logic ở đúng những sự kiện đó (txtKobeSearchCode_KeyDown
    /// chuyển focus khi Enter, CustomTextBox lọc ký tự). Gõ phím là cách duy nhất đi
    /// qua cùng đường mà người dùng đi.
    /// </summary>
    public static void SetText(AutomationElement e, string text)
    {
        e.Focus();
        Thread.Sleep(50); // WinForm cần một nhịp để dời caret trước khi nhận phím
        Keyboard.TypeSimultaneously(VirtualKeyShort.CONTROL, VirtualKeyShort.KEY_A);
        Keyboard.Press(VirtualKeyShort.DELETE);
        if (text.Length > 0) Keyboard.Type(text);
    }

    public static void Clear(AutomationElement e) => SetText(e, "");

    /// <summary>
    /// Bấm nút. Ưu tiên Invoke (không phụ thuộc con trỏ chuột / cửa sổ bị che); không
    /// có InvokePattern thì mới click chuột thật.
    /// </summary>
    public static void Click(AutomationElement e)
    {
        var invoke = e.Patterns.Invoke.PatternOrDefault;
        if (invoke is not null) { invoke.Invoke(); return; }

        var legacy = e.Patterns.LegacyIAccessible.PatternOrDefault;
        if (legacy is not null) { legacy.DoDefaultAction(); return; }

        e.Click();
    }

    /// <summary>
    /// Click CHUỘT THẬT vào giữa phần tử.
    ///
    /// Bắt buộc với những chỗ app nghe <c>MouseClick</c> chứ không phải <c>Click</c>:
    /// menu chính không có nút nào cả, mỗi ô là một <c>Panel</c> vẽ ảnh nền và bắt
    /// <c>pnlBtnX_MouseClick</c> (MainMenu.cs:343). Panel không có InvokePattern, nên
    /// <see cref="Click"/> sẽ "thành công" mà chẳng có gì xảy ra.
    /// </summary>
    public static void MouseClick(AutomationElement e)
    {
        e.Click();
    }

    /// <summary>
    /// Click chuột VẬT LÝ (chuột trái) tại tọa độ màn hình tuyệt đối.
    ///
    /// <para>Khác <see cref="MouseClick"/>: cái đó chỉ gọi UIA Invoke (hoặc LegacyIAccessible
    /// DoDefaultAction). Với DataGridView, Invoke không sinh ra <c>CellMouseClick</c> /
    /// <c>CellContentClick</c> — cần sự kiện chuột THẬT để chọn dòng, focus, mở menu.</para>
    /// </summary>
    public static void LeftClickPhysical(int x, int y)
    {
        Win32.SetCursorPos(x, y);
        Win32.mouse_event(Win32.MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
        Thread.Sleep(30);
        Win32.mouse_event(Win32.MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
    }

    /// <summary>
    /// Click chuột phải VẬT LÝ tại tọa độ màn hình tuyệt đối. Mở context menu
    /// của control đang nằm dưới con trỏ.
    /// </summary>
    public static void RightClickPhysical(int x, int y)
    {
        Win32.SetCursorPos(x, y);
        Thread.Sleep(30);
        Win32.mouse_event(Win32.MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0);
        Thread.Sleep(30);
        Win32.mouse_event(Win32.MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0);
    }

    /// <summary>Tọa độ trung tâm BoundingRectangle của phần tử (toạ độ màn hình).</summary>
    public static (int X, int Y) Center(AutomationElement e)
    {
        var r = e.BoundingRectangle;
        return ((int)(r.X + r.Width / 2), (int)(r.Y + r.Height / 2));
    }

    private static class Win32
    {
        public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        public const uint MOUSEEVENTF_LEFTUP   = 0x0004;
        public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
        public const uint MOUSEEVENTF_RIGHTUP   = 0x0010;

        [DllImport("user32.dll")]
        public static extern bool SetCursorPos(int X, int Y);

        [DllImport("user32.dll")]
        public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, int dwExtraInfo);
    }

    /// <summary>Ô nhập bên trong một ComboBox có thể sửa; không có thì trả về chính nó.</summary>
    public static AutomationElement EditInside(AutomationElement e)
    {
        try
        {
            var edit = e.FindFirstDescendant(cf => cf.ByControlType(ControlType.Edit));
            if (edit is not null) return edit;
        }
        catch { /* không có con nào */ }
        return e;
    }

    // ── Duyệt cây ────────────────────────────────────────────────────────────

    public static IEnumerable<AutomationElement> Children(AutomationElement e)
    {
        try { return e.FindAllChildren(); }
        catch { return []; }
    }

    /// <summary>Duyệt sâu theo chiều rộng, có chặn độ sâu để không lạc vào lưới nghìn dòng.</summary>
    public static IEnumerable<AutomationElement> Descendants(AutomationElement root, int maxDepth = 12)
    {
        var queue = new Queue<(AutomationElement El, int Depth)>();
        foreach (var c in Children(root)) queue.Enqueue((c, 1));

        while (queue.Count > 0)
        {
            var (el, depth) = queue.Dequeue();
            yield return el;
            if (depth >= maxDepth) continue;
            foreach (var c in Children(el)) queue.Enqueue((c, depth + 1));
        }
    }

    /// <summary>Đổ cây UIA ra text — công cụ chẩn đoán khi locator không khớp.</summary>
    public static string DumpTree(AutomationElement root, int maxDepth = 8, int maxChildrenPerNode = 40)
    {
        var sb = new StringBuilder();
        Dump(root, 0);
        return sb.ToString();

        void Dump(AutomationElement el, int depth)
        {
            var pad = new string(' ', depth * 2);
            var rect = "";
            try
            {
                var r = el.Properties.BoundingRectangle.ValueOrDefault;
                rect = $" @({r.X},{r.Y} {r.Width}x{r.Height})";
            }
            catch { /* phần tử không có toạ độ */ }

            sb.Append(pad)
              .Append(ControlTypeOf(el)?.ToString() ?? "?")
              .Append(" id=\"").Append(AutomationIdOf(el)).Append('"')
              .Append(" name=\"").Append(Txt.N(NameOf(el))).Append('"')
              .Append(" class=\"").Append(ClassNameOf(el)).Append('"')
              .Append(rect)
              .AppendLine();

            if (depth >= maxDepth) return;

            var children = Children(el).Take(maxChildrenPerNode + 1).ToList();
            var shown = children.Take(maxChildrenPerNode);
            foreach (var c in shown) Dump(c, depth + 1);
            if (children.Count > maxChildrenPerNode)
                sb.Append(pad).Append("  … (còn nữa, đã cắt ở ").Append(maxChildrenPerNode).AppendLine(" node)");
        }
    }
}
