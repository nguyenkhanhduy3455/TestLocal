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

    /// <summary>
    /// Gửi 1 phím vật lý qua <c>SendInput</c>. Đi qua message queue của Windows → an
    /// toàn khi cửa sổ khác đang topmost (gửi tới foreground window).
    /// </summary>
    public static void SendKey(ushort virtualKey)
    {
        var inputs = new Win32.INPUT[2];
        inputs[0] = new Win32.INPUT { type = Win32.INPUT_KEYBOARD_VAL, wVk = virtualKey };
        inputs[1] = new Win32.INPUT { type = Win32.INPUT_KEYBOARD_VAL, wVk = virtualKey, dwFlags = Win32.KEYEVENTF_KEYUP_VAL };
        Win32.SendInput((uint)inputs.Length, inputs, System.Runtime.InteropServices.Marshal.SizeOf<Win32.INPUT>());
    }

    /// <summary>Di chuyển chuột tới tọa độ màn hình tuyệt đối (không click).</summary>
    public static void MoveCursorTo(int x, int y) => Win32.SetCursorPos(x, y);

    /// <summary>Mã Virtual-Key F11 (Winuser.h VK_F11 = 0x7A).</summary>
    public const ushort VK_F11 = 0x7A;

    /// <summary>Mã Virtual-Key Right Arrow (Winuser.h VK_RIGHT = 0x27).</summary>
    public const ushort VK_RIGHT = 0x27;

    private static class Win32
    {
        public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        public const uint MOUSEEVENTF_LEFTUP   = 0x0004;
        public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
        public const uint MOUSEEVENTF_RIGHTUP   = 0x0010;

        // INPUT type (lưu vào biến-val để SendKey đọc được)
        public const uint INPUT_KEYBOARD_VAL = 1;
        public const uint KEYEVENTF_KEYUP_VAL = 0x0002;

        // SetWindowPos flags
        public static readonly IntPtr HWND_TOPMOST     = new(-1);
        public static readonly IntPtr HWND_NOTOPMOST   = new(-2);
        public const uint SWP_NOMOVE = 0x0002;
        public const uint SWP_NOSIZE = 0x0001;
        public const uint SWP_SHOWWINDOW = 0x0040;
        public const uint SWP_NOZORDER = 0x0004;

        [StructLayout(LayoutKind.Sequential)]
        public struct INPUT
        {
            public uint type;
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [DllImport("user32.dll")]
        public static extern bool SetCursorPos(int X, int Y);

        [DllImport("user32.dll")]
        public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, int dwExtraInfo);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter,
            int X, int Y, int cx, int cy, uint uFlags);

        [StructLayout(LayoutKind.Sequential)]
        public struct RECT { public int Left, Top, Right, Bottom; }

        [DllImport("user32.dll")]
        public static extern int GetWindowRect(IntPtr hWnd, out RECT lpRect);
    }

    /// <summary>
    /// Đẩy cửa sổ lên trên cùng (TOPMOST) hoặc trả về bình thường.
    /// Cần thiết khi cửa sổ khác (IDE, File Explorer) đang topmost che mất
    /// cửa sổ app — khi đó popup menu của app có thể bị che.
    /// </summary>
    public static void SetWindowTopmost(IntPtr hwnd, bool on = true)
    {
        Win32.SetWindowPos(hwnd,
            on ? Win32.HWND_TOPMOST : Win32.HWND_NOTOPMOST,
            0, 0, 0, 0,
            Win32.SWP_NOMOVE | Win32.SWP_NOSIZE | Win32.SWP_SHOWWINDOW);
    }

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    // ForceForeground dùng AttachThreadInput để "đánh cắp" foreground khi cửa sổ
    // khác (IDE) đang giữ — workaround cho Windows 10+ foreground lock.
    [DllImport("user32.dll")]
    private static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

    [DllImport("kernel32.dll")]
    private static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    /// <summary>
    /// Force một cửa sổ lên foreground bằng AttachThreadInput (cướp quyền foreground
    /// từ cửa sổ khác). Windows 10+ có foreground-lock ngăn SetForeground bình thường.
    /// </summary>
    public static bool ForceForeground(IntPtr hWnd)
    {
        var fg = GetForegroundWindow();
        if (fg == hWnd) return true;
        var fgThread = GetWindowThreadProcessId(fg, out _);
        var ourThread = GetCurrentThreadId();
        try
        {
            if (fgThread != 0) AttachThreadInput(ourThread, fgThread, true);
            AttachThreadInput(ourThread, GetWindowThreadProcessId(hWnd, out _), true);
            ShowWindow(hWnd, 9 /* SW_RESTORE */);
            return SetForegroundWindow(hWnd);
        }
        finally
        {
            AttachThreadInput(ourThread, fgThread, false);
            AttachThreadInput(ourThread, GetWindowThreadProcessId(hWnd, out _), false);
        }
    }

    /// <summary>
    /// Di chuyển cửa sổ tới (x, y) trên màn hình. <c>keepSize=true</c> để giữ nguyên
    /// kích thước; <c>false</c> để vừa dời vừa resize.
    /// </summary>
    public static void MoveWindow(IntPtr hwnd, int x, int y, bool keepSize = true)
    {
        var r = new Win32.RECT();
        if (keepSize && Win32.GetWindowRect(hwnd, out r) != 0)
        {
            Win32.SetWindowPos(hwnd, IntPtr.Zero, x, y,
                r.Right - r.Left, r.Bottom - r.Top,
                Win32.SWP_NOZORDER | Win32.SWP_SHOWWINDOW);
        }
        else
        {
            Win32.SetWindowPos(hwnd, IntPtr.Zero, x, y, 0, 0,
                Win32.SWP_NOZORDER | Win32.SWP_NOSIZE | Win32.SWP_SHOWWINDOW);
        }
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
