using System.Drawing;
using System.Drawing.Imaging;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;

namespace OchaCom.FlaUiTests.Infrastructure;

/// <summary>
/// Chụp <b>RIÊNG cái hộp thoại</b> đang hiện, để người đọc báo cáo tự xác nhận bằng mắt.
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// VÌ SAO KHÔNG DÙNG ẢNH CỦA <see cref="ScreenCapture"/>
/// ═══════════════════════════════════════════════════════════════════════════════
/// <c>ScreenCapture</c> chụp TOÀN desktop 1920×1080 — đúng thứ cần khi debug (nhìn được
/// cửa sổ nào chắn cửa sổ nào), nhưng sai thứ cần khi đi kèm một báo cáo parity: người
/// duyệt phải soi một câu chữ Nhật cao 20px nằm lọt giữa ảnh 2 MB.
///
/// <para>Lớp này cắt đúng hình chữ nhật của <c>#32770</c> ⇒ ảnh vài chục KB, mở ra là
/// thấy nguyên câu, đặt cạnh ảnh của bản web thì so được ngay.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════════
/// ĐI ĐÂU
/// ═══════════════════════════════════════════════════════════════════════════════
/// <code>
///   msgtbl-evidence/
///     win/&lt;MÃ&gt;__&lt;chỗ bung&gt;.png     ảnh hộp thoại, đã cắt
///     win/manifest.tsv                 mã ⇥ nguyên văn ⇥ nút ⇥ ảnh ⇥ giờ chụp
/// </code>
///
/// <para>Thư mục gốc lấy từ <c>OCHA_MSGTBL_EVIDENCE_DIR</c>, không có thì
/// <c>&lt;bin&gt;\artifacts\msgtbl-evidence\win</c>. Bên Playwright ghi vào
/// <c>web/</c> theo ĐÚNG quy ước tên file này, nên <c>collect-msgtbl-evidence.sh</c>
/// ghép được hai vế thành một bảng.</para>
///
/// <para><b>Nguyên văn vẫn ghi ra manifest</b> chứ không chỉ có ảnh: ảnh cho người, chữ
/// cho máy (và cho việc dán vào báo cáo). Một trong hai thiếu là phải mở lại lượt chạy.</para>
/// </summary>
public static class MsgEvidence
{
    /// <summary>Tên file: <c>E00003__frm203042-search-0ken.png</c> — mã đứng trước để sắp xếp tự nhiên.</summary>
    private static readonly Regex CodePattern = new(@"[EQI]\d{5}", RegexOptions.Compiled);

    private static readonly object Gate = new();

    public static string Directory
    {
        get
        {
            var fromEnv = Environment.GetEnvironmentVariable("OCHA_MSGTBL_EVIDENCE_DIR");
            return string.IsNullOrWhiteSpace(fromEnv)
                ? Path.Combine(AppContext.BaseDirectory, "artifacts", "msgtbl-evidence", "win")
                : fromEnv;
        }
    }

    /// <summary>
    /// Cắt và lưu ảnh của MỘT hộp thoại. Trả về đường dẫn ảnh, hoặc null nếu không chụp được.
    ///
    /// <para><paramref name="what"/> phải CHỨA mã (vd 「Q00049 — F7 会計作成」): mã được rút
    /// ra làm tiền tố tên file, phần còn lại thành hậu tố mô tả chỗ bung. Không có mã trong
    /// chuỗi thì file mang tiền tố <c>_</c> — vẫn lưu, nhưng sẽ không ghép cặp được với vế
    /// web, nên đừng để rơi vào nhánh đó.</para>
    ///
    /// <para>KHÔNG BAO GIỜ NÉM: một lượt chạy hỏng chỗ chụp ảnh mà làm đỏ cả testcase đang
    /// đo chuyện khác là đổi một câu trả lời lấy một câu hỏi mới.</para>
    /// </summary>
    /// <param name="template">
    /// Khuôn MSGTBL của mã (<c>{0}</c> CHƯA thay). Ghi kèm để bảng đối chiếu so được
    /// hai vế <b>bất kể tham số</b>: cùng một mã nhưng hai call-site truyền nhãn khác
    /// nhau (E00002 ở 個別 là 「個別入力のコード」, ở 患者登録 là 「保険者番号」) — so
    /// nguyên câu thì ra "lệch" trong khi cả hai đều ĐÚNG.
    /// </param>
    /// <param name="defaultButton">
    /// Nhãn nút MẶC ĐỊNH (nút đang giữ con trỏ ngay khi hộp thoại mở). UIA không phơi ra
    /// thuộc tính này, nhưng Win32 giao tiêu điểm cho nó — nên chỗ gọi đọc
    /// <c>FocusedElement</c> rồi truyền vào đây. Đây là phần HÀNH VI mà so chuỗi không
    /// thấy được: Q00049 để mặc định 「Cancel」 chính là cách legacy nói 「nguy hiểm」.
    /// </param>
    public static string? Capture(MsgBoxWin32.Found box, string what, string? template = null,
                                  string? defaultButton = null)
    {
        try
        {
            if (!GetWindowRect(box.Hwnd, out var r)) return null;

            var width = r.Right - r.Left;
            var height = r.Bottom - r.Top;
            if (width <= 0 || height <= 0) return null;

            var code = CodePattern.Match(what) is { Success: true } m ? m.Value : "_";
            var label = Slug(CodePattern.Replace(what, "").Trim(' ', '—', '-', ':'));
            var dir = Directory;
            System.IO.Directory.CreateDirectory(dir);

            var path = Path.Combine(dir, label.Length > 0 ? $"{code}__{label}.png" : $"{code}.png");

            using (var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb))
            {
                using (var g = Graphics.FromImage(bitmap))
                    g.CopyFromScreen(new Point(r.Left, r.Top), Point.Empty,
                                     new Size(width, height), CopyPixelOperation.SourceCopy);
                bitmap.Save(path, ImageFormat.Png);
            }

            AppendManifest(dir, code, box, Path.GetFileName(path), what, template, defaultButton);
            return path;
        }
        catch
        {
            // Chụp ảnh là việc PHỤ. Hỏng thì im lặng đi tiếp — assert vẫn chạy trên
            // box.Raw, tức bằng chứng bằng CHỮ không phụ thuộc vào ảnh.
            return null;
        }
    }

    /// <summary>
    /// Một dòng TSV cho mỗi lần chụp. TSV chứ không JSON: câu tiếng Nhật có đủ loại dấu
    /// ngoặc, còn TAB thì không bao giờ xuất hiện trong thân MessageBox.
    /// </summary>
    private static void AppendManifest(string dir, string code, MsgBoxWin32.Found box,
                                       string fileName, string what, string? template,
                                       string? defaultButton)
    {
        var path = Path.Combine(dir, "manifest.tsv");
        var buttons = string.Join("|", MsgBoxWin32.ButtonCaptions(box.Hwnd));

        // Nguyên văn giữ NGUYÊN ngắt dòng ở box.Raw; trong TSV thì thay bằng \n literal
        // để mỗi bản ghi vẫn là một dòng.
        var raw = box.Raw.Replace("\r", "").Replace("\n", "\\n");

        lock (Gate)
        {
            var isNew = !File.Exists(path);
            // UTF8Encoding(false): KHÔNG BOM. Encoding.UTF8 có BOM, và nó chui vào ĐẦU
            // cột đầu tiên khiến mọi bộ đọc TSV thấy tên cột là "\ufeffcode".
            using var writer = new StreamWriter(path, append: true, new UTF8Encoding(false));
            if (isNew)
                writer.WriteLine("code\tside\traw\ttemplate\ttitle\tbuttons\tdefault\tfile\twhat\tcaptured_at");
            writer.WriteLine(string.Join('\t',
                code, "win", raw, (template ?? "").Replace("\r", "").Replace("\n", "\\n"),
                box.Title, buttons, defaultButton ?? "", fileName, what,
                DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture)));
        }
    }

    /// <summary>Tên file an toàn: chỉ ASCII, để scp/zip/gửi mail không biến thành mojibake.</summary>
    private static string Slug(string s)
    {
        var sb = new StringBuilder(s.Length);
        foreach (var c in s)
        {
            if (c is >= 'a' and <= 'z' or >= 'A' and <= 'Z' or >= '0' and <= '9') sb.Append(c);
            else if (c is ' ' or '_' or '-' or '.') sb.Append('-');
            // Chữ Nhật/Việt bị BỎ, không phiên âm: tên file chỉ cần phân biệt được, còn
            // nội dung tiếng Nhật đã nằm đủ trong manifest.tsv.
        }

        var slug = Regex.Replace(sb.ToString(), "-{2,}", "-").Trim('-');
        return slug.Length <= 60 ? slug : slug[..60].TrimEnd('-');
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Rect { public int Left, Top, Right, Bottom; }

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
}
