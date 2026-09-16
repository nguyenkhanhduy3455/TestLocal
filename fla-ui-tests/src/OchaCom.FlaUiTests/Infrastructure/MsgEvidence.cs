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

            string icon;
            using (var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb))
            {
                using (var g = Graphics.FromImage(bitmap))
                    g.CopyFromScreen(new Point(r.Left, r.Top), Point.Empty,
                                     new Size(width, height), CopyPixelOperation.SourceCopy);
                icon = ClassifyIcon(bitmap);
                bitmap.Save(path, ImageFormat.Png);
            }

            AppendManifest(dir, code, box, Path.GetFileName(path), what, template, defaultButton, icon);
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
    /// Đọc ICON của hộp thoại từ chính ảnh vừa chụp, theo MÀU.
    ///
    /// ═══════════════════════════════════════════════════════════════════════════
    /// VÌ SAO ĐỌC MÀU CHỨ KHÔNG HỎI WIN32
    /// ═══════════════════════════════════════════════════════════════════════════
    /// Icon là thứ <b>chỗ gọi</b> quyết định (<c>ShowErrorMsg</c> / <c>ShowWarningMsg</c> /
    /// <c>ShowInfoMsg</c> / <c>ShowOKCancelMsg</c>), không phải mã thông báo — cùng một mã
    /// có thể đỏ ở màn này, vàng ở màn khác. Mà UIA thì KHÔNG phơi ra icon.
    ///
    /// <para>Đường Win32 (<c>STM_GETICON</c> rồi so <c>HICON</c> với
    /// <c>LoadIcon(NULL, IDI_ERROR)</c>…) KHÔNG dùng được: handle ấy thuộc tiến trình APP,
    /// còn <c>LoadIcon</c> của mình trả về handle của tiến trình TEST — hai con số không
    /// bao giờ bằng nhau.</para>
    ///
    /// <para>Đọc màu thì không vướng chuyện đó, và đã được đối chứng: 15 ảnh chụp sẵn,
    /// đáp án biết trước từ source, khớp <b>15/15</b> — kể cả ca bất ngờ
    /// <c>frm203002.cs:2205</c> dùng <c>ShowWarningMsg("E00002", …)</c> nên ra VÀNG chứ
    /// không phải đỏ như tên mã E gợi ý.</para>
    ///
    /// <para>ⓘ xanh và ？ xanh cùng màu — phân biệt bằng BỘ NÚT: chỉ có OK là thông báo,
    /// có Cancel/No là hộp hỏi. Cột <c>buttons</c> của manifest lo phần đó.</para>
    /// </summary>
    private static string ClassifyIcon(Bitmap bitmap)
    {
        // Icon nằm bên TRÁI thân hộp thoại: bỏ thanh tiêu đề (~22% trên) và vùng chữ.
        var x0 = (int)(bitmap.Width * 0.02);
        var x1 = (int)(bitmap.Width * 0.18);
        var y0 = (int)(bitmap.Height * 0.22);
        var y1 = (int)(bitmap.Height * 0.72);

        int red = 0, yellow = 0, blue = 0, total = 0;

        for (var x = x0; x < x1; x++)
        for (var y = y0; y < y1; y++)
        {
            var c = bitmap.GetPixel(x, y);
            var hue = c.GetHue();
            var sat = c.GetSaturation();
            var light = c.GetBrightness();

            if (sat < 0.35f || light < 0.12f || light > 0.93f) continue;  // xám/trắng/đen
            total++;

            if (hue < 20f || hue > 340f) red++;
            else if (hue is >= 35f and <= 70f) yellow++;
            else if (hue is >= 185f and <= 250f) blue++;
        }

        if (total == 0) return "(không đọc được)";
        if (red >= yellow && red >= blue) return "do";
        if (yellow >= blue) return "vang";
        return "xanh";
    }

    /// <summary>
    /// Một dòng TSV cho mỗi lần chụp. TSV chứ không JSON: câu tiếng Nhật có đủ loại dấu
    /// ngoặc, còn TAB thì không bao giờ xuất hiện trong thân MessageBox.
    /// </summary>
    private static void AppendManifest(string dir, string code, MsgBoxWin32.Found box,
                                       string fileName, string what, string? template,
                                       string? defaultButton, string icon)
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
                writer.WriteLine("code\tside\traw\ttemplate\ttitle\tbuttons\tdefault\ticon\tfile\twhat\tcaptured_at");
            writer.WriteLine(string.Join('\t',
                code, "win", raw, (template ?? "").Replace("\r", "").Replace("\n", "\\n"),
                box.Title, buttons, defaultButton ?? "", icon, fileName, what,
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

    private static Tests.MsgTblParity.MsgTblOracle? _oracle;
    private static bool _oracleTried;

    /// <summary>
    /// Chụp một hộp thoại mà chỗ gọi KHÔNG biết nó là mã nào — tự tra ngược MSGTBL.
    ///
    /// ═══════════════════════════════════════════════════════════════════════════
    /// VÌ SAO CÓ BẢN "AUTO"
    /// ═══════════════════════════════════════════════════════════════════════════
    /// Repo này đã có hàng chục fixture bung hộp thoại có mã mà không hề biết mã
    /// (<c>PatientSelectAssign</c>, <c>InpP1Dialogs</c>, <c>GuideSidePanel</c>…) — chúng
    /// chỉ so chữ. Gọi hàm này một dòng ở chỗ chúng ĐÃ bắt được hộp thoại là biến mỗi
    /// lượt chạy có sẵn thành bằng chứng có nhãn, KHÔNG phải sửa logic fixture nào.
    ///
    /// <para>Không tra ra mã thì vẫn chụp, dưới tiền tố <c>_</c> — ảnh vô danh còn hơn
    /// không có ảnh, và tên file nói thẳng là chưa tra được.</para>
    ///
    /// <para>KHÔNG BAO GIỜ NÉM (kể cả khi không có DB): đây là việc phụ gắn vào fixture
    /// của người khác, nó không được phép làm đỏ thứ đang đo.</para>
    /// </summary>
    public static string? CaptureAuto(MsgBoxWin32.Found? box, string where, string? defaultButton = null)
    {
        if (box is null) return null;
        try
        {
            if (!_oracleTried)
            {
                _oracleTried = true;
                var db = Tests.MsgTblParity.MsgTblOracle.CreateOrNull(TestSettings.Current);
                if (db is not null && db.ProbeError() is null) _oracle = db;
            }

            var hit = _oracle?.IdentifyCode(box.Raw);
            var label = hit is null ? $"_ {where}" : $"{hit.Code} {where}";
            return Capture(box, label, hit?.Template, defaultButton);
        }
        catch { return null; }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Rect { public int Left, Top, Right, Bottom; }

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
}
