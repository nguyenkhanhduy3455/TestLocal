using System.Runtime.InteropServices;
using System.Text;

namespace OchaCom.FlaUiTests.Tests.MasterAutoLists;

/// <summary>
/// Liệt kê cửa sổ của một tiến trình bằng <c>EnumWindows</c>. Cần vì khi một form modal đang
/// mở, <c>Application.GetAllTopLevelWindows</c> của FlaUI trả RỖNG (đo 2026-10-13: frm203037
/// hiện rõ trên ảnh nhưng không có trong danh sách) — Win32 thì vẫn thấy.
/// </summary>
internal static class Win32Windows
{
    internal sealed record Info(IntPtr Hwnd, string Title, string Class, bool Visible);

    private delegate bool EnumProc(IntPtr hwnd, IntPtr lParam);

    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hwnd, StringBuilder sb, int max);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr hwnd, StringBuilder sb, int max);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hwnd);

    public static IReadOnlyList<Info> OfProcess(int processId)
    {
        var list = new List<Info>();
        EnumWindows((h, _) =>
        {
            GetWindowThreadProcessId(h, out var pid);
            if (pid != processId) return true;
            var t = new StringBuilder(256);
            var c = new StringBuilder(256);
            GetWindowText(h, t, t.Capacity);
            GetClassName(h, c, c.Capacity);
            list.Add(new Info(h, t.ToString(), c.ToString(), IsWindowVisible(h)));
            return true;
        }, IntPtr.Zero);
        return list;
    }
}
