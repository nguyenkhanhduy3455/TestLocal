using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace OchaCom.FlaUiTests.Infrastructure;

/// <summary>
/// Chụp TOÀN MÀN HÌNH (mọi màn nếu máy nhiều màn) sau mỗi testcase.
///
/// Vì sao cả màn hình chứ không chỉ cửa sổ app: hộp thoại modal, tooltip, IME và cửa
/// sổ con của WinForm là cửa sổ TOP-LEVEL riêng, nằm NGOÀI khung frm203002. Chụp mỗi
/// cửa sổ app thì đúng lúc cần nhìn nhất — cái hộp thoại đang chặn thao tác — lại
/// không có trong ảnh.
/// </summary>
public static class ScreenCapture
{
    /// <summary>
    /// Bật DPI awareness cho tiến trình test. Không bật thì Windows co giãn toạ độ và
    /// ảnh chụp ra mờ/thiếu ở màn hình scale ≠ 100%. Phải gọi TRƯỚC thao tác UI đầu tiên.
    /// </summary>
    public static void EnableDpiAwareness()
    {
        try
        {
            // PER_MONITOR_AWARE_V2; máy cũ không có API này thì lùi về SetProcessDPIAware.
            if (!SetProcessDpiAwarenessContext(DpiAwarenessContextPerMonitorAwareV2))
                SetProcessDPIAware();
        }
        catch (EntryPointNotFoundException)
        {
            try { SetProcessDPIAware(); } catch { /* Windows quá cũ, bỏ qua */ }
        }
        catch { /* đã được đặt ở nơi khác — không phải lỗi */ }
    }

    /// <summary>Chụp toàn bộ desktop ảo, lưu PNG, trả về đường dẫn.</summary>
    public static string CaptureToFile(string directory, string fileNameWithoutExtension)
    {
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, Sanitize(fileNameWithoutExtension) + ".png");

        var bounds = SystemInformation.VirtualScreen;
        using var bitmap = new Bitmap(Math.Max(bounds.Width, 1), Math.Max(bounds.Height, 1),
                                      PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(bitmap))
        {
            g.CopyFromScreen(bounds.Location, Point.Empty, bounds.Size, CopyPixelOperation.SourceCopy);
        }
        bitmap.Save(path, ImageFormat.Png);
        return path;
    }

    private static string Sanitize(string name)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var chars = name.Select(c => invalid.Contains(c) ? '_' : c).ToArray();
        var s = new string(chars).Trim();
        // Tên test có thể rất dài (kèm cả câu tiếng Nhật) — cắt cho khỏi vượt MAX_PATH.
        return s.Length <= 120 ? s : s[..120];
    }

    private static readonly IntPtr DpiAwarenessContextPerMonitorAwareV2 = new(-4);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetProcessDpiAwarenessContext(IntPtr value);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetProcessDPIAware();
}
