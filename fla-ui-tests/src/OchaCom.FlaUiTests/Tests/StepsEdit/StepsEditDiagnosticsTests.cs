using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.StepsEdit;

/// <summary>
/// Công cụ chẩn đoán cho luồng StepsEdit. <b>[Explicit]</b> — không chạy theo
/// <c>run-steps-edit.ps1</c> thường; phải có <c>-Diagnostics</c>.
///
/// <para>Đổ cây UIA của menubar frm203002 và của dialog frm203050 ngay sau
/// khi mở. Cần chạy cái này <b>trước</b> khi viết <see cref="StepsEditFlow"/>
/// trên máy khác — locator của mục menu 「Step」 qua cầu MSAA→UIA có thể
/// khác tuỳ phiên bản Windows.</para>
///
/// <para>Không định nghĩa "[Category]" để lọc chính xác — runner dùng tên
/// class. Xem <c>run-steps-edit.ps1</c>.</para>
/// </summary>
[TestFixture]
[Explicit]
[Category("diagnostics")]
public sealed class StepsEditDiagnosticsTests : UiTestBase
{
    [Test, Order(1)]
    [Description("Diagnostics — đổ cây UIA MỌI cửa sổ top-level của app để tìm cửa sổ chứa menu bar")]
    public void DumpMenubar()
    {
        using var trace = TestTrace.Begin();

        Screen.Window.Focus();
        var outDir = Settings.Run.ScreenshotDir;
        var fullDir = Path.IsPathRooted(outDir)
            ? outDir
            : Path.Combine(AppContext.BaseDirectory, outDir);
        Directory.CreateDirectory(fullDir);

        // Trên máy này menu bar có thể KHÔNG nằm trong cây UIA của frm203002 —
        // VB6 port có thể render nó thành cửa sổ pop-up riêng hoặc đặt ở cửa sổ
        // cha của MENU.exe (chứ không phải của frm203002). Đổ TẤT CẢ cửa sổ top-level
        // đang hiện — DumpTree tiếp tục duyệt sâu 4-5 cấp để thấy MenuItem.
        var sb = new System.Text.StringBuilder();
        sb.AppendLine($"== App.ProcessId = {App.ProcessId} ({App.Application.Name}) ==");
        var windows = App.Windows();
        sb.AppendLine($"So cua so top-level dang hien: {windows.Count}");
        for (var i = 0; i < windows.Count; i++)
        {
            var w = windows[i];
            sb.AppendLine().AppendLine($"--- window[{i}] ---");
            sb.AppendLine($"  AutomationId='{Uia.AutomationIdOf(w)}'  Name='{Uia.NameOf(w)}'  Class='{Uia.ClassNameOf(w)}'");
            sb.AppendLine(Uia.DumpTree(w, maxDepth: 5, maxChildrenPerNode: 60));
        }

        // Phần BỔ SUNG: đổ tọa độ (BoundingRectangle) của grdRegi + hFG1 + tất cả
        // DataItem con — để biết phải click chuột phải vào ĐÂU để mở context menu.
        sb.AppendLine().AppendLine("=== BoundingRectangle của các lưới (debug RightClick) ===");
        foreach (var id in new[] { "grdRegi", "hFG1", "hFG2", "grdHist", "txtKobeSearchCode" })
        {
            var el = Uia.ById(Screen.Window, id);
            if (el is null) { sb.AppendLine($"  {id}: NOT FOUND"); continue; }
            var r = el.BoundingRectangle;
            sb.AppendLine($"  {id}: X={r.X} Y={r.Y} W={r.Width} H={r.Height}  " +
                          $"Center=({(int)(r.X + r.Width / 2)},{(int)(r.Y + r.Height / 2)})");
        }

        // Liệt kê TẤT CẢ DataItem của grdRegi + tọa độ — biết được dòng nào là
        // header, dòng nào là data.
        var grd = Uia.ById(Screen.Window, "grdRegi");
        if (grd is not null)
        {
            sb.AppendLine().AppendLine("=== DataItem trong grdRegi (debug RightClick) ===");
            try
            {
                var items = grd.FindAllDescendants(cf => cf.ByControlType(ControlType.DataItem));
                sb.AppendLine($"  Count: {items.Length}");
                for (var i = 0; i < items.Length; i++)
                {
                    var it = items[i];
                    var r = it.BoundingRectangle;
                    sb.AppendLine($"  [{i}] Name='{Uia.NameOf(it)}' " +
                                  $"X={r.X} Y={r.Y} W={r.Width} H={r.Height} " +
                                  $"Center=({(int)(r.X + r.Width / 2)},{(int)(r.Y + r.Height / 2)})");
                }
            }
            catch (Exception ex) { sb.AppendLine($"  Loi: {ex.Message}"); }
        }

        var file = Path.Combine(fullDir, "steps-edit-menubar.uia.txt");
        File.WriteAllText(file, sb.ToString());
        trace?.Note($"da ghi cay UIA {windows.Count} cua so vao: {file}");
        TestContext.AddTestAttachment(file, $"Cây UIA của {windows.Count} cửa sổ app — tìm menu bar");
    }

    [Test, Order(2)]
    [Description("Diagnostics — mở dialog rồi đổ cây UIA của frm203050")]
    public void DumpDialog()
    {
        using var trace = TestTrace.Begin();

        var dialog = StepsEditFlow.OpenStepsDialog(App, Screen.Window, trace);
        try
        {
            var dump = Uia.DumpTree(dialog);
            var outDir = Settings.Run.ScreenshotDir;
            var fullDir = Path.IsPathRooted(outDir)
                ? outDir
                : Path.Combine(AppContext.BaseDirectory, outDir);
            Directory.CreateDirectory(fullDir);

            var file = Path.Combine(fullDir, "steps-edit-dialog.uia.txt");
            File.WriteAllText(file, dump);
            trace?.Note($"da ghi cay UIA dialog vao: {file}");
            TestContext.AddTestAttachment(file, "Cây UIA frm203050 「Ｓｔｅｐ編集」");
        }
        finally
        {
            // Đóng để testcase khác (nếu có) mở lại được — và tránh để lại
            // dialog chặn màn hình giữa hai lần chạy.
            StepsEditFlow.CloseByBack(dialog, trace);
        }
    }
}
