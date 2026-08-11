using System.Text;
using FlaUI.Core;
using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;

namespace OchaCom.FlaUiTests.Infrastructure;

/// <summary>
/// Hộp thoại của app.
///
/// Mọi cảnh báo nghiệp vụ đều đi qua <c>COMMON.Lib.MsgDialog</c> → <c>MessageBox.Show</c>
/// (MsgDialog.cs:60-65), tức là hộp thoại Win32 chuẩn: ClassName <c>#32770</c>, tiêu đề
/// là <c>Application.ProductName</c>, nút OK/はい/いいえ.
///
/// Nội dung KHÔNG hard-code trong code C# mà đọc từ bảng <c>MSGTBL</c> (MsgTbl.cs) rồi
/// thay <c>{0}</c> bằng nhãn: E00002 + 「個別入力のコード」 → 「個別入力のコードが間違っています。」
/// Bộ test cũng lấy khuôn mẫu từ MSGTBL (xem <see cref="Data.OchaDb.GetMessage"/>) để
/// không chết khi khách sửa câu chữ.
/// </summary>
public static class Dialogs
{
    /// <summary>ClassName của mọi dialog Win32 (MessageBox, hộp thoại chung).</summary>
    public const string Win32DialogClass = "#32770";

    /// <summary>Các hộp thoại đang mở của tiến trình app.</summary>
    public static IReadOnlyList<Window> Open(AutomationBase automation, int processId)
    {
        var result = new List<Window>();
        try
        {
            foreach (var w in automation.GetDesktop().FindAllChildren(cf => cf.ByControlType(ControlType.Window)))
            {
                try
                {
                    if (w.Properties.ProcessId.ValueOrDefault != processId) continue;
                    if (Uia.ClassNameOf(w) != Win32DialogClass) continue;
                    if (!Uia.IsOnScreen(w)) continue;
                    result.Add(w.AsWindow());
                }
                catch { /* cửa sổ vừa đóng giữa chừng */ }
            }
        }
        catch { /* desktop bận, lần poll sau */ }
        return result;
    }

    /// <summary>Hộp thoại đầu tiên có nội dung chứa <paramref name="contains"/>.</summary>
    public static Window? Find(AutomationBase automation, int processId, string contains) =>
        Open(automation, processId).FirstOrDefault(d => Txt.Has(TextOf(d), contains));

    public static Window WaitFor(AutomationBase automation, int processId, string contains, TimeSpan? timeout = null) =>
        Waits.For(() => Find(automation, processId, contains), $"hộp thoại chứa 「{contains}」", timeout);

    /// <summary>Toàn bộ chữ trong hộp thoại (nối các Text lại).</summary>
    public static string TextOf(Window dialog)
    {
        var sb = new StringBuilder();
        try
        {
            foreach (var t in dialog.FindAllDescendants(cf => cf.ByControlType(ControlType.Text)))
                sb.Append(Uia.NameOf(t)).Append('\n');
        }
        catch { /* hộp thoại đã đóng */ }
        return sb.ToString();
    }

    /// <summary>Bấm nút đầu tiên khớp một trong các tên; không có nút nào khớp → false.</summary>
    public static bool ClickButton(Window dialog, params string[] names)
    {
        try
        {
            var buttons = dialog.FindAllDescendants(cf => cf.ByControlType(ControlType.Button));
            foreach (var name in names)
            {
                var btn = buttons.FirstOrDefault(b => Txt.Same(Uia.NameOf(b).Replace("&", ""), name));
                if (btn is null) continue;
                Uia.Click(btn);
                return true;
            }
        }
        catch { /* đã đóng */ }
        return false;
    }

    /// <summary>
    /// Bấm nút đầu tiên có tên CHỨA một trong các mảnh; không có nút nào khớp → false.
    ///
    /// <para>Dùng cho các FORM tự vẽ (frm203027 入金指定…), nơi nhãn nút gộp cả phím tắt
    /// lẫn chữ trên hai dòng: 「F10\n戻る」. <see cref="ClickButton"/> so KHỚP TUYỆT ĐỐI nên
    /// tìm 「戻る」 sẽ trượt. MessageBox chuẩn thì vẫn dùng ClickButton — nhãn của nó là
    /// một từ, so tuyệt đối tránh được cảnh 「はい」 khớp nhầm 「いいえ」.</para>
    ///
    /// <para>Và bấm bằng <b>chuột thật</b>, không phải InvokePattern: nút trên các form
    /// này là <c>GradientButton</c> tự vẽ, cùng lý do đã buộc <c>AppNavigator</c> phải
    /// click chuột vào các pane của menu chính. InvokePattern có thể "thành công" mà
    /// chẳng có gì xảy ra, và khi đó chỗ hỏng chỉ lộ ra ở tận bước sau.</para>
    /// </summary>
    public static bool ClickButtonContaining(Window dialog, params string[] fragments)
    {
        try
        {
            var buttons = dialog.FindAllDescendants(cf => cf.ByControlType(ControlType.Button));
            foreach (var fragment in fragments)
            {
                var btn = buttons.FirstOrDefault(b => Txt.Has(Uia.NameOf(b).Replace("&", ""), fragment));
                if (btn is null) continue;
                Uia.MouseClick(btn);
                return true;
            }
        }
        catch { /* đã đóng */ }
        return false;
    }

    /// <summary>Đóng hộp thoại cảnh báo (OK / はい) rồi chờ nó biến mất.</summary>
    public static void DismissOk(Window dialog, TimeSpan? timeout = null)
    {
        if (!ClickButton(dialog, "OK", "はい", "Yes"))
            dialog.Close();

        Waits.Until(() => !IsAlive(dialog), "hộp thoại đóng lại", timeout);
    }

    public static bool IsAlive(Window dialog)
    {
        try { return Uia.IsOnScreen(dialog); }
        catch { return false; }
    }
}
