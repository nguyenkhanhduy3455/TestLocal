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

    public static bool Has(string? haystack, string? needle) =>
        needle is { Length: > 0 } && N(haystack).Contains(N(needle), StringComparison.Ordinal);
}
