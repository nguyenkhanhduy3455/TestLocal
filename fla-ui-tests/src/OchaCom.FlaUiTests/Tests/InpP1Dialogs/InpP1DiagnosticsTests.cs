using System.Text;
using FlaUI.Core.AutomationElements;
using FlaUI.Core.Definitions;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests.InpP1Dialogs;

/// <summary>
/// Công cụ chẩn đoán của luồng InpP1Dialogs — <b>KHÔNG phải testcase</b>.
/// <c>[Explicit]</c> nên chạy bộ thường sẽ bỏ qua; gọi bằng
/// <c>.\run-inp-p1-dialog.ps1 -Diagnostics</c>.
///
/// <para>Chạy cái này TRƯỚC khi đi sửa locator trên một máy lạ: nó đổ cây UIA thật của
/// menu và của cả ba dialog ra <c>artifacts\screenshots\</c>. Không có bản đổ đó thì mọi
/// phán đoán 「control tên gì」 chỉ là đoán mò, và một lượt chạy đỏ chẳng nói thêm được gì.</para>
///
/// <para>Không cái nào ở đây bấm F9 — chẩn đoán thì không được ghi DB.</para>
/// </summary>
[TestFixture]
[Explicit("Cong cu chan doan, chay tay")]
[Category("diagnostics")]
[Category("inp-p1")]
public sealed class InpP1DiagnosticsTests : InpP1TestBase
{
    [Test, Order(1)]
    [Description("Diagnostics — đổ mọi cửa sổ top-level + toạ độ lưới, để dò menu F11")]
    public void DumpMenuAndWindows()
    {
        using var trace = TestTrace.Begin();
        Screen.Window.Focus();

        var sb = new StringBuilder();
        sb.AppendLine($"== App.ProcessId = {App.ProcessId} ({App.Application.Name}) ==");

        var windows = App.Windows();
        sb.AppendLine($"So cua so top-level dang hien: {windows.Count}");
        for (var i = 0; i < windows.Count; i++)
        {
            var w = windows[i];
            sb.AppendLine().AppendLine($"--- window[{i}] ---");
            sb.AppendLine($"  AutomationId='{Uia.AutomationIdOf(w)}' Name='{Uia.NameOf(w)}' " +
                          $"Class='{Uia.ClassNameOf(w)}'");
            sb.AppendLine(Uia.DumpTree(w, maxDepth: 5, maxChildrenPerNode: 60));
        }

        sb.AppendLine().AppendLine("=== BoundingRectangle cua cac control hay dung ===");
        foreach (var id in new[] { "grdRegi", "btnF11", "hFG1", "txtKobeSearchCode" })
        {
            var el = Uia.ById(Screen.Window, id);
            if (el is null) { sb.AppendLine($"  {id}: KHONG THAY"); continue; }
            var r = el.BoundingRectangle;
            sb.AppendLine($"  {id}: X={r.X} Y={r.Y} W={r.Width} H={r.Height} " +
                          $"Center=({(int)(r.X + r.Width / 2)},{(int)(r.Y + r.Height / 2)})");
        }

        // Mô tả từng dòng lưới đăng ký — biết dòng nào mở được 部位選択 (cột ẩn 51 != 99).
        sb.AppendLine().AppendLine("=== Dong cua grdRegi (de mo 部位選択) ===");
        try
        {
            var rows = Screen.Regi.Grid.Rows(limit: 15);
            sb.AppendLine($"  So dong (cat con 15): {rows.Count}");
            sb.AppendLine("  Header: " + string.Join(" | ", Screen.Regi.Grid.Headers()));
            for (var i = 0; i < rows.Count; i++)
            {
                sb.AppendLine($"  [dong {i}] gia tri : {rows[i]}");
                sb.AppendLine($"  [dong {i}] mo ta o : {string.Join(" | ", rows[i].CellDescriptions)}");
            }
        }
        catch (Exception e) { sb.AppendLine($"  Loi doc luoi: {e.Message}"); }

        WriteAndAttach("inp-p1-menu-and-windows.uia.txt", sb.ToString(),
                       "Cay UIA cac cua so app + luoi dang ky");
        trace.Note("da ghi inp-p1-menu-and-windows.uia.txt");
    }

    [Test, Order(2)]
    [Description("Diagnostics — mở frm203050 Ｓｔｅｐ編集 rồi đổ cây UIA")]
    public void DumpStepEditDialog() =>
        DumpOptionDialog(InpP1MenuFlow.StepEdit, "inp-p1-frm203050.uia.txt");

    [Test, Order(3)]
    [Description("Diagnostics — mở frm203044 チェック項目設定 rồi đổ cây UIA")]
    public void DumpCheckItemDialog() =>
        DumpOptionDialog(InpP1MenuFlow.CheckItem, "inp-p1-frm203044.uia.txt");

    [Test, Order(4)]
    [Description("Diagnostics — mở 部位選択 + Ｂｒサンプル rồi đổ cây UIA của cả hai")]
    public void DumpBrSampleDialogs()
    {
        using var trace = TestTrace.Begin();

        var tooth = BrSampleFlow.OpenToothDialog(App, Screen, trace);
        if (tooth is null)
        {
            WriteAndAttach("inp-p1-no-bui-dialog.uia.txt",
                           InpP1MenuFlow.DumpAllTopLevelWindows(App),
                           "Cua so dang mo khi KHONG mo duoc 部位選択");
            IgnoreWithReason(
                $"khong mo duoc 部位選択 tu luoi dang ky cua benh nhan {PatNo} — " +
                "moi dong deu co BuiDispFlg = 99 hoac luoi rong. Xem artifact.");
            return;
        }

        try
        {
            WriteAndAttach("inp-p1-frm902003.uia.txt",
                           Uia.DumpTree(tooth, maxDepth: 12, maxChildrenPerNode: 200),
                           "Cay UIA 部位選択 (frm902003)");
            BrSampleFlow.DumpElements(tooth, "inp-p1-frm902003-elements.txt");

            // Sơ đồ răng: liệt kê buiLabel{pos}{idx} + chữ đang hiện. Đây là bảng tra để
            // biết phím số có tới được ProcessCmdKey không.
            var sb = new StringBuilder();
            sb.AppendLine("pos 1=左上(LU) 2=右上(RU) 3=左下(LD) 4=右下(RD)  — BuiInfo.cs:540-560");
            for (var pos = 1; pos <= 4; pos++)
            {
                for (var idx = 1; idx <= 8; idx++)
                {
                    var text = BrSampleFlow.ToothText(tooth, pos, idx);
                    sb.AppendLine($"  {BrSampleFlow.ToothId(pos, idx),-14} " +
                                  $"{(text is null ? "KHONG THAY CONTROL" : $"chu=「{text}」")}");
                }
            }
            WriteAndAttach("inp-p1-tooth-map.txt", sb.ToString(), "So do rang cua 部位選択");

            BrSampleFlow.SelectUpperLeftTeeth(tooth, Settings.InpP1.BrTeeth, trace);
            LogKq(0, $"sau khi bam Delete, →, {string.Join(",", Settings.InpP1.BrTeeth)}: " +
                string.Join(" ", BrSampleFlow.MarkedTeeth(tooth)));

            var opened = BrSampleFlow.OpenBrSample(App, tooth, trace);
            try
            {
                WriteAndAttach("inp-p1-frm203049.uia.txt",
                               Uia.DumpTree(opened.Dialog, maxDepth: 12, maxChildrenPerNode: 200),
                               "Cay UIA Ｂｒサンプル (frm203049)");
                LogKq(0, opened.HasError
                    ? $"frm203049 bao loi: 「{opened.ErrorMessage}」"
                    : $"frm203049 co {BrSampleFlow.BrRows(opened.Dialog).Count} dong mau");
            }
            finally
            {
                BrSampleFlow.CloseBrSample(App, opened.Dialog, trace);
            }
        }
        finally
        {
            // Để nguyên thì dialog modal chặn mọi thao tác của lượt chạy sau.
            try { BrSampleFlow.CloseToothDialog(App, tooth, trace); }
            catch (Exception e) { Log($"khong dong duoc 部位選択: {e.Message}"); }
        }
    }

    [Test, Order(5)]
    [Description("Diagnostics — liệt kê mục CODMST 62/63/64/70 mà bốn combo đổ ra")]
    public void DumpComboSources()
    {
        var db = RequireInpDb("can DB de doc CODMST");

        var sb = new StringBuilder();
        foreach (var cdType in new[] { 62, 63, 64, StepEditDialog.KindCdType })
        {
            sb.AppendLine($"=== CODMST cd_type {cdType} (ORDER BY SORT_ORDER — CodMst.cs:41) ===");
            foreach (var item in db.ComboItems(cdType))
                sb.AppendLine($"  cd_val={item.CdVal,-4} sort_order={item.SortOrder,-4} 「{item.Label}」");
            sb.AppendLine();
        }

        var text = sb.ToString();
        LogKq(0, text);
        WriteAndAttach("inp-p1-codmst.txt", text, "Muc CODMST cua bon combo");
    }

    // ─────────────────────────────────────────────────────────────────────────

    private void DumpOptionDialog(InpP1MenuFlow.OptionItem item, string fileName)
    {
        using var trace = TestTrace.Begin();

        var dialog = InpP1MenuFlow.Open(App, Screen.Window, item, trace);
        try
        {
            WriteAndAttach(fileName, Uia.DumpTree(dialog, maxDepth: 12, maxChildrenPerNode: 200),
                           $"Cay UIA {item.DialogId}「{item.TitleFragment}」");

            // Danh sách phẳng: dễ đối chiếu tên control với Designer hơn cây lồng nhau.
            BrSampleFlow.DumpElements(dialog, Path.ChangeExtension(fileName, null) + "-elements.txt");

            var buttons = dialog.FindAllDescendants(cf => cf.ByControlType(ControlType.Button))
                .Select(b => $"  id=「{Uia.AutomationIdOf(b)}」 name=「{Uia.NameOf(b).Replace("\n", " ")}」 " +
                             $"enabled={SafeEnabled(b)}");
            LogKq(0, $"Nut cua {item.DialogId}:{Environment.NewLine}{string.Join(Environment.NewLine, buttons)}");
        }
        finally
        {
            InpP1MenuFlow.CloseByBack(App, dialog, item.DialogId, trace);
        }
    }

    private static string SafeEnabled(AutomationElement e)
    {
        try { return e.IsEnabled.ToString(); }
        catch { return "?"; }
    }

    private void WriteAndAttach(string fileName, string content, string description)
    {
        InpP1MenuFlow.WriteArtifact(fileName, content);

        var dir = Settings.Run.ScreenshotDir;
        var full = Path.IsPathRooted(dir) ? dir : Path.Combine(AppContext.BaseDirectory, dir);
        var path = Path.Combine(full, fileName);
        try { TestContext.AddTestAttachment(path, description); }
        catch (Exception e) { Log($"khong dinh kem duoc {fileName}: {e.Message}"); }
        Log($"da ghi: {path}");
    }
}
