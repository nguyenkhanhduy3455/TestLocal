using System.Globalization;
using System.Text;

namespace OchaCom.FlaUiTests.Infrastructure;

/// <summary>
/// Chuẩn hoá chuỗi lấy từ UI.
///
/// WinForm trộn nửa/đủ chiều rộng trong cùng một màn: header cột 12 của hfgKobetu là
/// 「ｺｰﾄﾞ」 NỬA chiều rộng (modKobetu.cs:108) trong khi web port hiển thị 「コード」 ĐỦ
/// chiều rộng. So sánh sau NFKC thì cả hai cùng ra một chuỗi, khỏi phải nhớ bên nào
/// dùng bên nào. Điểm/số cũng vậy: 「１２０」 → 「120」.
/// </summary>
public static class Txt
{
    /// <summary>NFKC + bỏ khoảng trắng hai đầu (kể cả U+3000) + gộp xuống dòng thành 1 space.</summary>
    public static string N(string? s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        var n = s.Normalize(NormalizationForm.FormKC);
        var sb = new StringBuilder(n.Length);
        foreach (var c in n) sb.Append(c is '\r' or '\n' or '\t' ? ' ' : c);
        return sb.ToString().Trim(' ', '　');
    }

    /// <summary>Số nguyên trong ô lưới; ô rỗng / không phải số → null.</summary>
    public static int? Int(string? s)
    {
        var n = N(s).Replace(",", "");
        return int.TryParse(n, NumberStyles.Integer, CultureInfo.InvariantCulture, out var v) ? v : null;
    }

    public static bool Same(string? a, string? b) => N(a) == N(b);

    /// <summary>
    /// Chuỗi ở dạng ĐỌC ĐƯỢC TRÊN LOG: mọi ký tự ngoài ASCII in được thành <c>\uXXXX</c>.
    ///
    /// <para><b>Bắt buộc dùng khi in 省略表示 部位.</b> Chuỗi đó là ký tự EUDC (vùng
    /// private-use U+E000…U+F8FF): in thẳng ra console/`.trx` thì KHÔNG thấy gì, và hai
    /// chuỗi khác nhau trông y hệt nhau. Bản đầu của spec Playwright tương ứng
    /// (<c>bui-caret-newline-branch.spec.ts</c>) in ra <c>"ABC\nX"</c> cho cả hai kỳ vọng
    /// — vô dụng đúng ở chỗ cần dùng nhất. Escape theo MÃ thì đối chiếu được.</para>
    ///
    /// <para>⚠️ KHÔNG đi qua <see cref="N"/>: hàm đó NFKC + biến <c>\r\n</c> thành dấu
    /// cách, tức xoá sạch đúng bằng chứng cần đo ở nhánh 「nhảy qua newline」.</para>
    /// </summary>
    public static string Vis(string? s) =>
        s is null
            ? "(null)"
            : "\"" + string.Concat(s.Select(c => c switch
              {
                  '"' => "\\\"",
                  '\\' => "\\\\",
                  >= ' ' and <= '~' => c.ToString(),
                  _ => $"\\u{(int)c:x4}",
              })) + "\"";

    public static bool Has(string? haystack, string? needle) =>
        needle is { Length: > 0 } && N(haystack).Contains(N(needle), StringComparison.Ordinal);
}
