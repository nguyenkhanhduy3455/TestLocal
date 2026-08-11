using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using OchaCom.FlaUiTests.App;

namespace OchaCom.FlaUiTests.Infrastructure;

/// <summary>
/// Tìm hộp thoại modal của app.
///
/// <para>Ban đầu viết riêng cho luồng ParitySaveData. Khi luồng thứ hai
/// (ParityAccountingCorrection) cũng cần, nó được nâng lên đây — chép đôi một hàm
/// đã chứng minh là cần thiết thì lần sau sửa sẽ quên mất một bản.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÌ SAO KHÔNG DÙNG <see cref="Dialogs.Open"/>
/// ═══════════════════════════════════════════════════════════════════════════
/// <c>Dialogs.Open()</c> duyệt <c>automation.GetDesktop().FindAllChildren(...)</c> rồi
/// đọc ProcessId/ClassName của TỪNG cửa sổ trên desktop — kể cả <c>frm203002</c> lúc đó
/// đang bị MessageBox chặn. Việc đọc thuộc tính của một cửa sổ có luồng UI bị chặn sẽ
/// ném lỗi hoặc treo, và <c>try/catch</c> bọc cả vòng lặp khiến hàm <b>âm thầm trả về
/// danh sách rỗng</b>.
///
/// Đo được trên máy thật: hộp thoại 「処置データは、変更されています。保存しますか？」
/// hiện rành rành trên màn hình, ảnh chụp có, mà chờ 90 giây vẫn báo
/// 「hộp thoại đang mở: (không có)」.
///
/// Ở đây đi ba đường, đường nào ra trước dùng đường đó, và ghi lại đường nào đã ăn —
/// vì nếu mai kia hỏng nữa thì phải biết đường nào còn sống:
///   1. <c>Window.ModalWindows</c> — API của FlaUI dành đúng cho việc này, hỏi thẳng
///      cửa sổ CHỦ chứ không quét desktop.
///   2. <c>Application.GetAllTopLevelWindows</c> — phạm vi tiến trình, rẻ hơn desktop.
///   3. <c>Dialogs.Open</c> — đường cũ, giữ làm chốt chặn cuối.
/// </summary>
public static class ModalDialogs
{
    public sealed record Found(Window Dialog, string Route);

    /// <summary>Hộp thoại đầu tiên có nội dung chứa <paramref name="contains"/>; null nếu không thấy.</summary>
    public static Found? Find(OchaApp app, Window owner, string contains)
    {
        foreach (var (route, get) in Routes(app, owner))
        {
            IReadOnlyList<Window> windows;
            try { windows = get(); }
            catch { continue; }

            foreach (var w in windows)
            {
                string text;
                try { text = Txt.N(Dialogs.TextOf(w)); }
                catch { continue; }

                if (Txt.Has(text, contains)) return new Found(w, route);
            }
        }
        return null;
    }

    /// <summary>Mọi hộp thoại đang mở, gộp từ cả ba đường, khử trùng theo con trỏ runtime.</summary>
    public static IReadOnlyList<Window> All(OchaApp app, Window? owner)
    {
        var seen = new List<Window>();
        var ids = new HashSet<string>();

        foreach (var (_, get) in Routes(app, owner))
        {
            IReadOnlyList<Window> windows;
            try { windows = get(); }
            catch { continue; }

            foreach (var w in windows)
            {
                try
                {
                    var key = string.Join("/", w.Properties.RuntimeId.ValueOrDefault ?? []);
                    if (key.Length > 0 && !ids.Add(key)) continue;
                    seen.Add(w);
                }
                catch { /* cửa sổ vừa đóng */ }
            }

            // Đường nào ra kết quả thì dừng: đường 3 (quét desktop) tốn hàng chục giây
            // khi có modal đang chặn, mà nếu đường 1/2 đã trả lời thì nó không thêm gì.
            if (seen.Count > 0) break;
        }
        return seen;
    }

    private static IEnumerable<(string Route, Func<IReadOnlyList<Window>> Get)> Routes(
        OchaApp app, Window? owner)
    {
        if (owner is not null)
            yield return ("Window.ModalWindows", () => owner.ModalWindows);

        yield return ("Application.GetAllTopLevelWindows", () =>
            app.Application.GetAllTopLevelWindows(app.Automation)
               .Where(IsDialogLike)
               .ToList());

        yield return ("Dialogs.Open (desktop)", () => Dialogs.Open(app.Automation, app.ProcessId));
    }

    /// <summary>
    /// Cửa sổ có dáng hộp thoại. KHÔNG bó cứng vào ClassName <c>#32770</c>: đường
    /// <c>GetAllTopLevelWindows</c> trả về cả form thường, mà một số cảnh báo của app
    /// là Form tự vẽ chứ không phải MessageBox.
    /// </summary>
    private static bool IsDialogLike(Window w)
    {
        try
        {
            if (!Uia.IsOnScreen(w)) return false;
            if (Uia.ClassNameOf(w) == Dialogs.Win32DialogClass) return true;

            // Form tự vẽ: không phải cửa sổ chính của màn hình đang thao tác, và có nút.
            var id = Uia.AutomationIdOf(w);
            if (id.StartsWith("frm", StringComparison.OrdinalIgnoreCase)) return false;
            return w.FindAllDescendants(cf => cf.ByControlType(ControlType.Button)).Length > 0;
        }
        catch
        {
            return false;
        }
    }
}
