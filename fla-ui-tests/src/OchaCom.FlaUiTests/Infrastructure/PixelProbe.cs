using System.Drawing;
using System.Drawing.Imaging;
using FlaUI.Core.AutomationElements;

namespace OchaCom.FlaUiTests.Infrastructure;

/// <summary>
/// Đọc MÀU NỀN thật của một control bằng cách lấy pixel trên màn hình.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÌ SAO PHẢI ĐI ĐƯỜNG NÀY
/// ═══════════════════════════════════════════════════════════════════════════
/// UIAutomation KHÔNG phơi ra <c>Control.BackColor</c> — không có property nào,
/// không có pattern nào. Mà 面入力 (frm203035) báo 「mặt răng đang được chọn」 CHỈ
/// bằng màu nền: <c>chgBkColor</c> đặt <c>lblMen*.BackColor</c> và
/// <c>lblNum*.BackColor</c> thành <c>Color.LightGray</c> khi chọn, <c>Color.White</c>
/// khi bỏ chọn (frm203035.cs:596-627, bảng màu ở :45-49).
///
/// Không đọc được màu thì mọi khẳng định 「bấm phím 5 có bật mặt 中央 không」 chỉ còn
/// cách suy ngược từ chuỗi 面 sau khi 確定 — tức là đo cái khác rồi đoán, đúng thứ mà
/// PROBE-GUIDELINE cấm.
///
/// Bên web cùng câu hỏi này đo bằng thuộc tính SVG <c>fill="#d4d4d4"</c>
/// (<c>cavity-tooth-model.tsx</c>); ở đây thứ tương đương duy nhất là pixel.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÌ SAO LẤY MẪU NHIỀU ĐIỂM CHỨ KHÔNG PHẢI TÂM
/// ═══════════════════════════════════════════════════════════════════════════
/// <c>lblMenCenter</c> chỉ 20×13 px và có MỘT chữ 「Ｏ」 canh giữa (frm203035.Designer.cs:149).
/// Lấy đúng pixel tâm là trúng nét chữ màu đen — đọc ra 「không phải White cũng không phải
/// LightGray」 và mọi so sánh sau đó vô nghĩa. Vì thế hàm này quét một lưới điểm trong rect
/// rồi lấy màu XUẤT HIỆN NHIỀU NHẤT: nền bao giờ cũng chiếm đa số so với nét chữ.
///
/// ⚠️ Đọc pixel là đọc thứ ĐANG HIỆN TRÊN MÀN HÌNH. Cửa sổ khác đè lên, máy khoá màn hình,
/// hay RDP thu nhỏ thì màu đọc ra là của thứ đang che — cùng một điều kiện mà
/// <c>Uia.LeftClickPhysical</c> đã đòi hỏi (xem README mục 1).
/// </summary>
public static class PixelProbe
{
    /// <summary>Nền của mặt CHƯA chọn — <c>_colors[0]</c> (frm203035.cs:47).</summary>
    public static readonly Color Unselected = Color.White;

    /// <summary>Nền của mặt ĐANG chọn — <c>_colors[1]</c> (frm203035.cs:48).</summary>
    public static readonly Color Selected = Color.LightGray;

    /// <summary>
    /// Màu chiếm đa số trong BoundingRectangle của phần tử; đọc không được → null.
    ///
    /// <para>Co rect vào trong 1 px mỗi cạnh để không dính viền của control bên cạnh.</para>
    /// </summary>
    public static Color? DominantColor(AutomationElement element)
    {
        var rect = Uia.RectOf(element);
        if (rect is null || rect.Value.Width <= 0 || rect.Value.Height <= 0) return null;
        return DominantColor(rect.Value);
    }

    /// <summary>Màu chiếm đa số trong một hình chữ nhật toạ độ MÀN HÌNH.</summary>
    public static Color? DominantColor(Rectangle rect)
    {
        var r = Rectangle.Inflate(rect, -1, -1);
        if (r.Width <= 0 || r.Height <= 0) r = rect;
        if (r.Width <= 0 || r.Height <= 0) return null;

        try
        {
            using var bitmap = new Bitmap(r.Width, r.Height, PixelFormat.Format32bppArgb);
            using (var g = Graphics.FromImage(bitmap))
            {
                g.CopyFromScreen(new Point(r.X, r.Y), Point.Empty, r.Size,
                                 CopyPixelOperation.SourceCopy);
            }

            var tally = new Dictionary<int, int>();
            for (var y = 0; y < r.Height; y++)
            {
                for (var x = 0; x < r.Width; x++)
                {
                    var argb = bitmap.GetPixel(x, y).ToArgb();
                    tally[argb] = tally.TryGetValue(argb, out var n) ? n + 1 : 1;
                }
            }
            if (tally.Count == 0) return null;

            var best = tally.OrderByDescending(kv => kv.Value).First().Key;
            return Color.FromArgb(best);
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// Màu đọc được có phải là <paramref name="expected"/> không, cho phép lệch
    /// <paramref name="tolerance"/> mỗi kênh.
    ///
    /// <para>Cần dung sai vì Windows có thể vẽ control qua một lớp theme/ClearType làm
    /// lệch vài đơn vị. White (255,255,255) và LightGray (211,211,211) cách nhau 44 nên
    /// dung sai 20 vẫn phân biệt được thoải mái.</para>
    /// </summary>
    public static bool IsNear(Color? actual, Color expected, int tolerance = 20) =>
        actual is { } c
        && Math.Abs(c.R - expected.R) <= tolerance
        && Math.Abs(c.G - expected.G) <= tolerance
        && Math.Abs(c.B - expected.B) <= tolerance;

    /// <summary>Mô tả một màu cho thông điệp assert — null in ra rõ là 「không đọc được」.</summary>
    public static string Describe(Color? c) =>
        c is null ? "(không đọc được pixel)" : $"RGB({c.Value.R},{c.Value.G},{c.Value.B})";
}
