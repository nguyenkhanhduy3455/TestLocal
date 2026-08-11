using FlaUI.Core.AutomationElements;
using FlaUI.Core.Input;
using FlaUI.Core.WindowsAPI;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;

namespace OchaCom.FlaUiTests.Tests.ParitySaveData;

/// <summary>
/// Công cụ chẩn đoán cho bộ parity, KHÔNG phải testcase. <c>[Explicit]</c> nên chạy cả
/// bộ sẽ bỏ qua.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// VÌ SAO CẦN CHẠY CÁI NÀY TRƯỚC
/// ═══════════════════════════════════════════════════════════════════════════
/// BUG-2a / 2b / 2c đều cần chọn 部位 (răng cụ thể) — 2a cần đúng răng ở vị trí 13 và 19,
/// 2c cần bất kỳ răng nào để 修復物 có chỗ bám. Việc đó đi qua dialog 部位選択 (frm902003).
///
/// Đọc source thì thấy `lblScBui*` / `lblSrBui*`, nhưng đó chỉ là MARKER phủ lên sơ đồ
/// (スケーリング / SRP・PCur) chứ không phải nút chọn răng. Tôi chưa từng thấy cây UIA thật
/// của dialog này, và viết locator mò cho một cửa sổ chưa nhìn thấy chỉ tạo ra một lượt
/// chạy đỏ vô ích.
///
/// Nên: chạy công cụ này MỘT lần, gửi lại 2 file .txt sinh ra, rồi tôi viết tiếp
/// 2a/2b/2c bằng locator thật.
///
///   .\run-tests.ps1 -Filter "ParityDiagnostics"
///   (hoặc)  dotnet test --filter "FullyQualifiedName~ParityDiagnostics"
///
/// File ra nằm ở  bin\Debug\net8.0-windows\artifacts\  và cũng được đính vào báo cáo NUnit.
/// </summary>
[TestFixture]
[Category("diagnostics")]
[Explicit("Công cụ chẩn đoán, chạy tay")]
public sealed class BuiDialogDiagnosticsTests : UiTestBase
{
    [Test]
    [Description("Đổ cây UIA của dialog 部位選択 (frm902003) để viết được locator chọn răng")]
    public void DumpBuiSelectionDialog()
    {
        var dir = ArtifactDir();

        // ─── Cách mở 部位選択 (frm203002.cs:1686-1697) ────────────────────────
        //   grdRegi_CellClick: MỘT click vào ô cột 部位 là đủ,
        //   miễn là cột ẩn 51 (BuiDispFlg) của dòng đó != "99".
        //
        // Lần chạy đầu hỏng vì tôi đóng cứng "ô thứ 1 là 部位". Lưới có thể phơi thêm
        // ô header, và dòng đầu (歯科初診料) cũng có thể là dòng không nhận 部位.
        // Nên ở đây DÒ theo mô tả ô, và thử nhiều dòng — đồng thời ghi lại tất cả để
        // nếu vẫn hỏng thì có dữ liệu mà lần.
        var regi = Screen.Regi;
        var rows = regi.Grid.Rows(limit: 12);
        Assert.That(rows.Count, Is.GreaterThan(0), "Lưới đăng ký chưa có dòng nào.");

        var report = new System.Text.StringBuilder();
        report.AppendLine("Header luoi dang ky: " + string.Join(" | ", regi.Grid.Headers()));
        for (var i = 0; i < rows.Count; i++)
        {
            report.AppendLine($"[dong {i}] gia tri : {rows[i]}");
            report.AppendLine($"[dong {i}] mo ta o : {string.Join(" | ", rows[i].CellDescriptions)}");
        }
        TestContext.Out.WriteLine(report.ToString());

        Window? dialog = null;
        var tried = new List<string>();

        foreach (var (row, rowIndex) in rows.Select((r, i) => (r, i)))
        {
            var cells = Uia.Children(row.Element).ToList();
            var descs = row.CellDescriptions;

            // Ô 部位: ưu tiên ô có mô tả chứa 部位; không có thì lui về chỉ số cố định.
            var idx = -1;
            for (var c = 0; c < descs.Count && c < cells.Count; c++)
                if (Txt.Has(descs[c], "部位")) { idx = c; break; }
            if (idx < 0 && cells.Count > RegiGrid.Col.Bui) idx = RegiGrid.Col.Bui;
            if (idx < 0) continue;

            tried.Add($"dong {rowIndex} o {idx}");
            Uia.MouseClick(cells[idx]);
            Waits.Step();

            dialog = Waits.TryFor(FindBuiWindow, TimeSpan.FromSeconds(4));
            if (dialog is not null)
            {
                TestContext.Out.WriteLine($"Mo duoc 部位選択 bang CLICK o {idx} cua dong {rowIndex}");
                break;
            }

            // Enter cũng mở (grdRegi_KeyDown, frm203002.cs:3549-3557).
            Keyboard.Press(VirtualKeyShort.ENTER);
            dialog = Waits.TryFor(FindBuiWindow, TimeSpan.FromSeconds(4));
            if (dialog is not null)
            {
                TestContext.Out.WriteLine($"Mo duoc 部位選択 bang ENTER tren o {idx} cua dong {rowIndex}");
                break;
            }
        }

        if (dialog is null)
        {
            var fallback = Path.Combine(dir, $"parity-no-bui-dialog-{Stamp()}.txt");
            File.WriteAllText(fallback,
                report + "\n\nDa thu: " + string.Join(", ", tried) +
                "\n\nCua so dang mo:\n" + DescribeAllWindows());
            TestContext.AddTestAttachment(fallback, "Luoi + cua so khi KHONG mo duoc 部位選択");
            Assert.Fail(
                $"Da thu {tried.Count} o 部位 ma khong mo duoc frm902003. " +
                $"Da ghi mo ta luoi + danh sach cua so vao {fallback} — gui file do. " +
                "Co the moi dong deu co BuiDispFlg = 99 (dong 日計/合計), luc do phai chen mot " +
                "処置 CAN 部位 truoc roi dialog se tu bat len.");
        }

        var path = Path.Combine(dir, $"frm902003-bui-tree-{Stamp()}.txt");
        File.WriteAllText(path, Uia.DumpTree(dialog!, maxDepth: 12, maxChildrenPerNode: 200));
        TestContext.AddTestAttachment(path, "Cây UIA của dialog 部位選択");
        TestContext.Out.WriteLine($"Đã ghi: {path}");

        // Liệt kê riêng mọi phần tử có AutomationId chứa 'Bui' — nhiều khả năng đây chính
        // là các ô răng, và danh sách phẳng dễ đọc hơn cây lồng nhau.
        var buiPath = Path.Combine(dir, $"frm902003-bui-elements-{Stamp()}.txt");
        var lines = Uia.Descendants(dialog!, maxDepth: 12)
            .Select(e => new
            {
                Id = Uia.AutomationIdOf(e),
                Name = Uia.NameOf(e),
                Type = Uia.ControlTypeOf(e)?.ToString() ?? "",
                Cls = Uia.ClassNameOf(e),
            })
            .Where(x => x.Id.Length > 0 || x.Name.Length > 0)
            .Select(x => $"{x.Type,-14} id=「{x.Id}」 name=「{x.Name}」 class=「{x.Cls}」")
            .ToList();
        File.WriteAllLines(buiPath, lines);
        TestContext.AddTestAttachment(buiPath, "Danh sách phẳng phần tử của 部位選択");
        TestContext.Out.WriteLine($"Da ghi: {buiPath} ({lines.Count} phan tu)");

        // Đóng lại: để nguyên thì dialog modal chặn mọi thao tác của lượt chạy sau
        // (app vẫn sống và app.attachIfRunning = true).
        if (!Dialogs.ClickButton(dialog!, "F12 戻る", "戻る", "キャンセル", "Cancel"))
        {
            try { dialog!.Close(); } catch { /* da dong */ }
        }
        TestContext.Out.WriteLine("Da dong dialog 部位選択");
    }

    [Test]
    [Description("Đổ cây UIA của hộp thoại F9 để xác nhận tên nút và nút mặc định")]
    public void DumpSaveDialog()
    {
        var dir = ArtifactDir();

        Screen.Window.Focus();
        Keyboard.Press(VirtualKeyShort.F9);
        Waits.Step();

        // Dung ModalDialogs, KHONG dung Dialogs.WaitFor: duong quet desktop bi mu khi
        // MessageBox modal dang chan luong UI cua app (xem chu thich dau ModalDialogs).
        var hit = Waits.For(() => ModalDialogs.Find(App, Screen.Window, SaveFlow.SaveQuestionFragment),
                            $"hop thoai chua 「{SaveFlow.SaveQuestionFragment}」",
                            TestSettings.Current.Parity.DialogTimeout);
        var dialog = hit.Dialog;
        TestContext.Out.WriteLine($"Tim thay bang duong: {hit.Route}");

        var text = Txt.N(Dialogs.TextOf(dialog));
        TestContext.Out.WriteLine($"Nội dung: 「{text}」");

        var buttons = dialog.FindAllDescendants(cf =>
                cf.ByControlType(FlaUI.Core.Definitions.ControlType.Button))
            .Select(b => new
            {
                Name = Uia.NameOf(b).Replace("&", ""),
                Focused = b.Properties.HasKeyboardFocus.ValueOrDefault,
            })
            .ToList();

        foreach (var b in buttons)
            TestContext.Out.WriteLine($"  nút 「{b.Name}」 focus={b.Focused}");

        var path = Path.Combine(dir, $"save-dialog-{Stamp()}.txt");
        File.WriteAllText(path,
            $"Nội dung: {text}\n\n" +
            string.Join("\n", buttons.Select(b => $"nút 「{b.Name}」 focus={b.Focused}")) +
            "\n\n" + Uia.DumpTree(dialog, maxDepth: 8, maxChildrenPerNode: 40));
        TestContext.AddTestAttachment(path, "Hộp thoại F9 保存しますか");
        TestContext.Out.WriteLine($"Đã ghi: {path}");

        // TUYỆT ĐỐI không bấm はい ở đây — công cụ chẩn đoán thì không được ghi DB.
        Dialogs.ClickButton(dialog, "キャンセル", "Cancel");
    }

    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Tìm cửa sổ 部位選択.
    ///
    /// <para><b>Phải hỏi <c>ModalWindows</c> TRƯỚC.</b> frm902003 là dialog modal thuộc
    /// sở hữu của frm203002, mà <c>Application.GetAllTopLevelWindows</c> không trả về
    /// cửa sổ dạng đó. Đúng cái bẫy đã làm hỏng việc tìm MessageBox: dialog mở rành rành
    /// trên màn hình, ảnh chụp có, mà hàm tìm báo không thấy — rồi test đi thử tiếp 10
    /// dòng nữa một cách vô ích.</para>
    /// </summary>
    private Window? FindBuiWindow()
    {
        // 1. Cửa sổ modal của màn hình đang thao tác — đường đúng.
        try
        {
            foreach (var w in Screen.Window.ModalWindows)
                if (IsBui(w)) return w;
        }
        catch { /* cửa sổ chủ bận */ }

        // 2. Theo AutomationId, phòng khi dialog không được khai là modal.
        var byId = App.Window("frm902003");
        if (byId is not null) return byId;

        // 3. Quét cửa sổ top-level của tiến trình.
        try
        {
            foreach (var w in App.Windows())
                if (IsBui(w)) return w;
        }
        catch { /* bỏ qua */ }

        return null;
    }

    private static bool IsBui(Window w)
    {
        try
        {
            return Txt.Same(Uia.AutomationIdOf(w), "frm902003")
                || Txt.Has(Uia.NameOf(w), "部位");
        }
        catch { return false; }
    }

    private string DescribeAllWindows()
    {
        var sb = new System.Text.StringBuilder();
        foreach (var w in App.Windows())
        {
            sb.AppendLine($"cửa sổ id=「{Uia.AutomationIdOf(w)}」 title=「{Uia.NameOf(w)}」 " +
                          $"class=「{Uia.ClassNameOf(w)}」 onScreen={Uia.IsOnScreen(w)}");
        }
        foreach (var d in Dialogs.Open(App.Automation, App.ProcessId))
            sb.AppendLine($"hộp thoại: 「{Txt.N(Dialogs.TextOf(d))}」");
        return sb.ToString();
    }

    private static string ArtifactDir()
    {
        var dir = Path.Combine(AppContext.BaseDirectory, "artifacts");
        Directory.CreateDirectory(dir);
        return dir;
    }

    private static string Stamp() => DateTime.Now.ToString("yyyyMMdd-HHmmss");
}
