using System.Runtime.InteropServices;
using System.Text;

namespace OchaCom.FlaUiTests.Infrastructure;

/// <summary>
/// Đọc và bấm MessageBox của app <b>bằng Win32 thuần</b>, KHÔNG qua UIA.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÌ SAO PHẢI CÓ
/// ═══════════════════════════════════════════════════════════════════════════
/// <see cref="ModalDialogs"/> đi ba đường, và đường cuối
/// (<c>Dialogs.Open</c>) quét TOÀN BỘ desktop rồi đọc thuộc tính của TỪNG cửa sổ. Khi
/// không có hộp thoại nào thì hai đường đầu trả rỗng ⇒ lần nào cũng rơi xuống đường quét
/// desktop. Đo được 2026-08-27: một testcase gọi nó vài lần treo <b>hơn 20 phút</b> và
/// runner phải kill — trong khi app hoàn toàn khoẻ.
///
/// <para>Win32 thì khác hẳn: <c>EnumWindows</c> + <c>GetClassNameW</c> chạy trong vài
/// mili-giây và KHÔNG bao giờ chặn, vì nó chỉ đọc bảng cửa sổ của USER32 chứ không gọi
/// vào tiến trình đích. Đúng công cụ cho việc 「có MessageBox nào đang mở không」.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// BẤM NÚT BẰNG PostMessage, KHÔNG PHẢI SendMessage
/// ═══════════════════════════════════════════════════════════════════════════
/// <c>SendMessage</c> chờ cửa sổ đích xử lý xong mới trả về — bấm 「OK」 của một hộp thoại
/// mà handler phía sau lại mở hộp thoại khác thì lời gọi treo luôn. <c>PostMessage</c>
/// bỏ thư vào hàng đợi rồi trả về ngay.
///
/// <para>Ban đầu là lớp riêng của <c>Tests/GuideSidePanel</c>; nâng lên đây ngày
/// 2026-09-04 khi luồng thứ hai (<c>Tests/PatientVisitList</c>) cần đúng nó — theo quy
/// ước ở README mục 8b: dùng chung thì nâng lên <c>Infrastructure/</c>, không chép đôi.
/// Lần đó <c>Dialogs.Open</c> KHÔNG nhìn thấy hộp 「CSV出力が完了しました。」 dù ảnh chụp
/// cho thấy nó đang chắn giữa màn hình.</para>
/// </summary>
public static class MsgBoxWin32
{
    /// <summary>Lớp cửa sổ của MessageBox / dialog Win32.</summary>
    public const string DialogClass = "#32770";

    public sealed record Found(IntPtr Hwnd, string Title, string Text)
    {
        public override string ToString() => $"「{Text}」 (tiêu đề 「{Title}」)";
    }

    /// <summary>Mọi MessageBox đang HIỆN của tiến trình, theo thứ tự z-order.</summary>
    public static IReadOnlyList<Found> All(int processId)
    {
        var result = new List<Found>();

        EnumWindows((hwnd, _) =>
        {
            if (!IsWindowVisible(hwnd)) return true;

            GetWindowThreadProcessId(hwnd, out var pid);
            if (pid != processId) return true;

            var cls = new StringBuilder(64);
            GetClassName(hwnd, cls, cls.Capacity);
            if (cls.ToString() != DialogClass) return true;

            result.Add(new Found(hwnd, TextOfWindow(hwnd), StaticTextOf(hwnd)));
            return true;
        }, IntPtr.Zero);

        return result;
    }

    /// <summary>MessageBox đầu tiên đang mở; không có thì null.</summary>
    public static Found? First(int processId) => All(processId).FirstOrDefault();

    /// <summary>Nguyên văn mọi MessageBox đang mở, nối bằng 「 + 」; rỗng nếu không có.</summary>
    public static string TextOfAll(int processId) =>
        string.Join(" + ", All(processId).Select(d => d.Text).Where(t => t.Length > 0));

    /// <summary>
    /// Bấm nút có nhãn khớp <paramref name="captions"/> (so sau khi bỏ dấu &amp; của phím tắt).
    /// Không có nhãn nào khớp thì trả false và KHÔNG bấm bừa nút khác.
    /// </summary>
    public static bool ClickButton(IntPtr dialog, params string[] captions)
    {
        var target = IntPtr.Zero;

        EnumChildWindows(dialog, (child, _) =>
        {
            var cls = new StringBuilder(64);
            GetClassName(child, cls, cls.Capacity);
            if (!cls.ToString().Equals("Button", StringComparison.OrdinalIgnoreCase)) return true;

            var caption = TextOfWindow(child).Replace("&", "");
            foreach (var want in captions)
            {
                if (!caption.Equals(want, StringComparison.OrdinalIgnoreCase)) continue;
                target = child;
                return false;
            }
            return true;
        }, IntPtr.Zero);

        if (target == IntPtr.Zero) return false;

        PostMessage(target, BM_CLICK, IntPtr.Zero, IntPtr.Zero);
        return true;
    }

    /// <summary>Nhãn của mọi nút trên hộp thoại — để log khi không bấm được nút nào.</summary>
    public static IReadOnlyList<string> ButtonCaptions(IntPtr dialog)
    {
        var names = new List<string>();
        EnumChildWindows(dialog, (child, _) =>
        {
            var cls = new StringBuilder(64);
            GetClassName(child, cls, cls.Capacity);
            if (cls.ToString().Equals("Button", StringComparison.OrdinalIgnoreCase))
                names.Add(TextOfWindow(child).Replace("&", ""));
            return true;
        }, IntPtr.Zero);
        return names;
    }

    /// <summary>Chữ trong thân hộp thoại = text của các control <c>Static</c>.</summary>
    private static string StaticTextOf(IntPtr dialog)
    {
        var parts = new List<string>();
        EnumChildWindows(dialog, (child, _) =>
        {
            var cls = new StringBuilder(64);
            GetClassName(child, cls, cls.Capacity);
            if (!cls.ToString().Equals("Static", StringComparison.OrdinalIgnoreCase)) return true;

            var text = TextOfWindow(child).Trim();
            if (text.Length > 0) parts.Add(text);
            return true;
        }, IntPtr.Zero);

        return string.Join(" ", parts).Replace("\r", " ").Replace("\n", " ").Trim();
    }

    private static string TextOfWindow(IntPtr hwnd)
    {
        var length = GetWindowTextLength(hwnd);
        if (length <= 0) return "";
        var sb = new StringBuilder(length + 1);
        GetWindowText(hwnd, sb, sb.Capacity);
        return sb.ToString();
    }

    private const uint BM_CLICK = 0x00F5;

    private delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool EnumChildWindows(IntPtr parent, EnumWindowsProc callback, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr hwnd, StringBuilder name, int count);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int count);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowTextLength(IntPtr hwnd);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hwnd);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr PostMessage(IntPtr hwnd, uint msg, IntPtr wParam, IntPtr lParam);
}
