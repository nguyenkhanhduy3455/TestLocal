using FlaUI.Core.AutomationElements;
using FlaUI.Core.WindowsAPI;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;

namespace OchaCom.FlaUiTests.Tests.TreatmentGrid;

/// <summary>
/// <b>MÃ ĐẶC BIỆT của コードモード và NỘI DUNG danh sách trong 処置選択.</b>
///
/// <para>Mở được dialog chưa nói lên gì. Bộ này so TỪNG DÒNG trong lưới
/// <c>dgvView</c> của 処置選択: コード / 枝番 / 名称 / 点数 — thứ quyết định hai bên có
/// thật sự khớp hay không.</para>
///
/// <para>Bên kia: <c>web-tenant-tests/tests/treatment-grid-special-codes.spec.ts</c>,
/// cùng số hiệu TC-S1…TC-S6.</para>
///
/// ═══════════════════════════════════════════════════════════════════════════
/// BẢN ĐỒ NHÁNH — modMain.GetTrtmasCod
/// ═══════════════════════════════════════════════════════════════════════════
///   101/102/103 → KasanCode()      → về NGAY, KHÔNG mở picker
///   50          → ParamData (IS)   → picker RIÊNG, kèm ô nhập リッター数
///   999         → Misoutyaku()     → về NGAY  ⚠️ xem TC-S6: đang CRASH
///   333         → bật pHoumon rồi ĐI TIẾP xuống query bình thường
///   1..6        → 自由処置          → về NGAY, KHÔNG mở picker
///   17          → luôn mở picker (kèm ô 自費金額) — xem TreatmentGridPointCodeTests
///   còn lại     → query `trt_cd = <mã> order by trt_sb`
///                 0 dòng → 「該当処置はありません。」
///                 1 dòng && mã != 17 → tự commit, KHÔNG mở picker
///                 ≥2 dòng → mở 処置選択
///
/// ═══════════════════════════════════════════════════════════════════════════
/// ĐO THẬT 2026-08-25 — bệnh nhân 10, ngày 2026-08-03
/// ═══════════════════════════════════════════════════════════════════════════
///   101 → không dialog, không thêm dòng
///   50  → picker 2 dòng: 50-0 N2O使用リッター数 (0点) / 50-1 O2使用リッター数 (0点),
///         kèm câu 「N2O、O2使用リッター数を入力してください。」
///   999 → ⚠️ APP CRASH: 「Index was outside the bounds of the array.」
///   333 → picker ≥11 dòng, TẤT CẢ mã 333: 歯科訪問診療1(1100) … 5(95),
///         (20分未満), (未届出)
///   1   → không dialog (自由処置)
///   179 → không dialog
///   202 → picker ≥11 dòng, TẤT CẢ mã 202: 笑気吸入鎮静法(IS) 70 … 歯科吸入麻酔 2600
///   599 → picker ≥11 dòng, TẤT CẢ mã 599: 歯科医師居宅療養管理指導I 517 …
///
/// ═══════════════════════════════════════════════════════════════════════════
/// KHÔNG GHI DB
/// ═══════════════════════════════════════════════════════════════════════════
/// Mọi testcase đều ĐÓNG picker bằng 戻る (không bấm F9 確定) nên không dòng nào vào
/// lưới, và không bao giờ bấm F9 登録.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// CHẠY
/// ═══════════════════════════════════════════════════════════════════════════
///   .\run-edit-treatment-rows.ps1 -Case SpecialCode
/// </summary>
[TestFixture]
[Category("treatment-grid")]
public sealed class TreatmentGridSpecialCodeTests : UiTestBase
{
    private const string NoMatchMessage = "該当処置はありません。";

    private TreatmentGridOps _grid = null!;

    [OneTimeSetUp]
    public void SpecialCodeOneTimeSetUp() => _grid = new TreatmentGridOps(Screen);

    private static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); } catch { /* không có console */ }
    }

    private static void LogKq(string tag, string line) => Log($"=== KQ-{tag} === {line}");

    private IReadOnlyList<Window> RealDialogs()
    {
        var result = new List<Window>();
        foreach (var d in ModalDialogs.All(App, Screen.Window))
        {
            try
            {
                if (d.FindAllDescendants(cf =>
                        cf.ByControlType(FlaUI.Core.Definitions.ControlType.Button)).Length > 0)
                    result.Add(d);
            }
            catch { /* cửa sổ vừa đóng */ }
        }
        return result;
    }

    private Window? WaitForAnyDialog(int seconds = 12)
    {
        Window? hit = null;
        Waits.TryUntil(() => (hit = RealDialogs().FirstOrDefault()) is not null,
                       TimeSpan.FromSeconds(seconds));
        return hit;
    }

    /// <summary>Một dòng của <c>dgvView</c>: コード / 枝番 / 名称 / 点数.</summary>
    private sealed record PickRow(string Code, string Sub, string Name, string Point)
    {
        public override string ToString() => $"{Code}-{Sub} 「{Name}」 {Point}点";
    }

    /// <summary>
    /// Đọc NỘI DUNG lưới <c>dgvView</c> của 処置選択 (frm203016.Designer.cs:126).
    ///
    /// <para>Đây là phần đáng giá nhất của cả bộ: mở được dialog thì bên nào cũng làm
    /// được, nhưng DANH SÁCH bên trong mới là thứ người dùng chọn.</para>
    /// </summary>
    private List<PickRow> ReadPicker(Window dialog, int limit = 40)
    {
        var rows = new List<PickRow>();
        var grid = Uia.ById(dialog, "dgvView");
        if (grid is null) return rows;

        foreach (var r in new WinFormsGrid(grid).Rows(limit))
        {
            var c = r.Cells;
            if (c.Count < 4) continue;
            if (c[0].Length == 0 && c[2].Length == 0) continue;
            // Dòng tiêu đề lọt vào thì cột đầu là chữ 「コード」, không phải số.
            if (Txt.Int(c[0]) is null) continue;
            rows.Add(new PickRow(c[0], c[1], c[2], c[3]));
        }
        return rows;
    }

    private bool ClosePicker(Window dialog)
    {
        try
        {
            var btn = Uia.Descendants(dialog).FirstOrDefault(
                e => Uia.ControlTypeOf(e) == FlaUI.Core.Definitions.ControlType.Button
                     && Txt.Has(Uia.NameOf(e), "戻る"));
            if (btn is not null) Uia.Click(btn);
        }
        catch { /* cửa sổ vừa đóng */ }
        return Waits.TryUntil(() => RealDialogs().Count == 0, TimeSpan.FromSeconds(5));
    }

    private void DismissAll()
    {
        for (var i = 0; i < 4; i++)
        {
            var open = RealDialogs();
            if (open.Count == 0) return;
            foreach (var d in open)
                if (!Dialogs.ClickButton(d, "OK", "いいえ", "No", "Continue"))
                    if (!ClosePicker(d)) Dialogs.ClickButton(d, "キャンセル", "Cancel");
            Waits.TryUntil(() => RealDialogs().Count == 0, TimeSpan.FromSeconds(3));
        }
    }

    private string InpMode()
    {
        var l = Uia.ById(Screen.Window, "lbInpMode");
        return l is null ? "?" : Txt.N(Uia.ValueOf(l));
    }

    /// <summary>Đổi 入力モード bằng cách click chính cái nhãn (frm203002.cs:7126).</summary>
    private void EnsureCodeMode()
    {
        var label = Uia.ById(Screen.Window, "lbInpMode");
        if (label is null) IgnoreWithReason("không thấy nhãn 入力モード (lbInpMode)");
        for (var i = 0; i < 3 && !Txt.Same(InpMode(), "コード"); i++)
        {
            var (x, y) = Uia.Center(label!);
            Uia.LeftClickPhysical(x, y);
            Thread.Sleep(450);
        }
        Assert.That(InpMode(), Is.EqualTo("コード"),
            $"không chuyển được sang コードモード (đang 「{InpMode()}」)");
    }

    private RegiRow TargetRow()
    {
        var row = _grid.Snapshot().FirstOrDefault(
            r => Txt.N(r.Ten) is not ("-" or "－") && !Txt.Has(r.Ryo, "日計") && r.Ryo.Length > 0);
        if (row is null)
            IgnoreWithReason("lưới không có 処置行 nào để gõ vào ô 点");
        return row!;
    }

    /// <summary>Gõ một mã vào ô 点 rồi Enter (đang ở コードモード).</summary>
    private void EnterCode(TestTrace trace, string code)
    {
        DismissAll();
        EnsureCodeMode();
        var row = TargetRow();
        trace.Do($"go ma 「{code}」 vao o 点 roi Enter", () =>
        {
            _grid.FocusCell(row, RegiGrid.Col.Ten);
            if (!_grid.IsEditing()) _grid.Press(VirtualKeyShort.RETURN);
            Thread.Sleep(250);
            _grid.Type(code);
            _grid.Press(VirtualKeyShort.RETURN);
        });
        Thread.Sleep(1200);
    }

    /// <summary>Mã mở picker, và MỌI dòng trong picker phải mang đúng mã đó.</summary>
    private void AssertPickerListsOnly(string code, string mustContainName, int minRows)
    {
        using var trace = TestTrace.Begin();
        EnterCode(trace, code);

        var dialog = WaitForAnyDialog();
        Assert.That(dialog, Is.Not.Null, $"mã {code} phải mở 処置選択, nhưng không thấy hộp thoại nào");

        var rows = ReadPicker(dialog!);
        LogKq($"S-{code}", $"picker có {rows.Count} dòng:");
        foreach (var r in rows.Take(12)) Log("        · " + r);
        trace.Shot($"ma-{code}");

        try
        {
            Assert.Multiple(() =>
            {
                Assert.That(rows, Has.Count.GreaterThanOrEqualTo(minRows),
                    $"picker của mã {code} phải có ít nhất {minRows} dòng, đang có {rows.Count}");

                // GetTrtmasCod query `where t.trt_cd = <mã> order by t.trt_sb` ⇒ MỌI dòng
                // cùng コード, chỉ khác 枝番. Lọt mã khác nghĩa là truy vấn sai.
                var wrong = rows.Where(r => r.Code != code).Select(r => r.Code).Distinct().ToList();
                Assert.That(wrong, Is.Empty,
                    $"picker của mã {code} lọt mã khác: {string.Join(", ", wrong)}. " +
                    "GetTrtmasCod chỉ query `trt_cd = <mã>` nên mọi dòng phải cùng コード.");

                Assert.That(rows.Any(r => Txt.Has(r.Name, mustContainName)), Is.True,
                    $"picker của mã {code} phải có dòng tên chứa 「{mustContainName}」. " +
                    $"Đang có: {string.Join(" / ", rows.Take(5).Select(r => r.Name))}");

                Assert.That(rows.Select(r => r.Sub).Distinct().Count(), Is.EqualTo(rows.Count),
                    "mỗi dòng phải một 枝番 khác nhau (order by trt_sb)");
            });
        }
        finally { ClosePicker(dialog!); DismissAll(); }
    }

    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(1)]
    [Description("TC-S1 — mã 101 (加算) KHÔNG mở picker: KasanCode xử lý rồi về ngay")]
    public void TcS1_Code101_HandledByKasanCode_NoPicker()
    {
        using var trace = TestTrace.Begin();
        var rowsBefore = _grid.RowCount();
        EnterCode(trace, "101");

        var dialogs = RealDialogs();
        LogKq("S1", $"hộp thoại: {dialogs.Count}, số dòng {rowsBefore} → {_grid.RowCount()}");

        // modMain.cs GetTrtmasCod: `if (trt_cd == 101 || 102 || 103) { KasanCode(...); return; }`
        // — nhánh này KHÔNG bao giờ tới câu query nên KHÔNG có 処置選択.
        Assert.That(dialogs, Is.Empty,
            "mã 101 đi nhánh KasanCode rồi về NGAY (modMain.cs GetTrtmasCod) — không được " +
            $"mở 処置選択. Đang thấy {dialogs.Count} hộp thoại.");
        DismissAll();
    }

    [Test, Order(2)]
    [Description("TC-S2 — mã 50 (IS) mở picker riêng: 50-0 N2O / 50-1 O2 + ô nhập リッター数")]
    public void TcS2_Code50_OpensIsPickerWithLitreInput()
    {
        using var trace = TestTrace.Begin();
        EnterCode(trace, "50");

        var dialog = WaitForAnyDialog();
        Assert.That(dialog, Is.Not.Null, "mã 50 phải mở picker IS");

        var rows = ReadPicker(dialog!);
        var text = Txt.N(Dialogs.TextOf(dialog!)).Replace("\n", " ");
        LogKq("S2", $"picker: {rows.Count} dòng — {string.Join(" / ", rows)}");
        trace.Shot("ma-50");

        try
        {
            Assert.Multiple(() =>
            {
                Assert.That(rows, Has.Count.EqualTo(2),
                    $"mã 50 phải ra ĐÚNG 2 dòng (N2O và O2), đang có {rows.Count}: " +
                    string.Join(" / ", rows));

                Assert.That(rows.Any(r => Txt.Has(r.Name, "N2O")), Is.True,
                    $"thiếu dòng N2O使用リッター数. Đang có: {string.Join(" / ", rows)}");
                Assert.That(rows.Any(r => Txt.Has(r.Name, "O2使用")), Is.True,
                    $"thiếu dòng O2使用リッター数. Đang có: {string.Join(" / ", rows)}");

                // Điểm KHÁC của nhánh 50 so với picker thường: nó có Ô NHẬP リッター数
                // ngay trong dialog, giống mã 17 có ô 自費金額.
                Assert.That(text, Does.Contain(Txt.N("リッター数")),
                    $"picker mã 50 phải có ô nhập 「リッター数」 kèm câu hướng dẫn. Nội dung: 「{text}」");
            });
        }
        finally { ClosePicker(dialog!); DismissAll(); }
    }

    [Test, Order(3)]
    [Description("TC-S3 — mã 333 (訪問診療): picker chỉ chứa mã 333, có 歯科訪問診療1")]
    public void TcS3_Code333_ListsOnlyHomeVisitTreatments() =>
        AssertPickerListsOnly("333", "歯科訪問診療1", minRows: 5);

    [Test, Order(4)]
    [Description("TC-S4 — mã 202 (麻酔): picker chỉ chứa mã 202, có 笑気吸入鎮静法")]
    public void TcS4_Code202_ListsOnlyAnaesthesiaTreatments() =>
        AssertPickerListsOnly("202", "笑気吸入鎮静法", minRows: 5);

    [Test, Order(5)]
    [Description("TC-S5 — mã 599 (介護): picker chỉ chứa mã 599, có 居宅療養管理指導")]
    public void TcS5_Code599_ListsOnlyCareInsuranceTreatments() =>
        AssertPickerListsOnly("599", "居宅療養管理指導", minRows: 5);

    // ═══════════════════════════════════════════════════════════════════════
    // TC-S6 — mã 999 làm APP CRASH.  ĐẶT CUỐI CÙNG.
    // ═══════════════════════════════════════════════════════════════════════

    [Test, Order(6)]
    [Description("TC-S6 — [LỖI WINFORM] mã 999 (未装着) làm app ném IndexOutOfRangeException")]
    public void TcS6_Code999_CrashesTheApp_KnownDefect()
    {
        using var trace = TestTrace.Begin();
        EnterCode(trace, "999");

        var dialog = WaitForAnyDialog();
        var text = dialog is null ? "" : Txt.N(Dialogs.TextOf(dialog)).Replace("\n", " ");
        LogKq("S6", $"hộp thoại: 「{(text.Length > 160 ? text[..160] : text)}」");
        trace.Shot("ma-999-crash");

        // ⚠️ ĐÂY LÀ LỖI CỦA CHÍNH WINFORM, KHÔNG PHẢI HÀNH VI ĐỂ PORT.
        //
        // Đo 2026-08-25 (có ảnh): gõ 999 → Misoutyaku() ném
        // 「Index was outside the bounds of the array.」 và app bung hộp thoại .NET
        // 「Unhandled exception has occurred in your application」 (Continue / Quit).
        // Giá trị 999 đã kịp ghi vào ô 点 trước khi crash.
        //
        // Rất có thể phụ thuộc dữ liệu: bệnh nhân test không có 未装着 nào, và
        // Misoutyaku duyệt một mảng rỗng. Testcase này CỐ Ý chỉ GHI NHẬN, không
        // khẳng định "phải crash" — bản web KHÔNG được bắt chước chỗ này.
        //
        // Đặt CUỐI fixture vì crash làm hỏng trạng thái app cho mọi bước sau.
        var crashed = Txt.Has(text, "Unhandled exception");
        LogKq("S6", crashed
            ? "⚠️ XÁC NHẬN: WinForm CRASH ở mã 999 — 「Index was outside the bounds of the array」"
            : "mã 999 KHÔNG còn crash — nếu vậy hãy cập nhật lại doc-comment của testcase này");

        Assert.Pass(crashed
            ? "GHI NHẬN lỗi WinForm: mã 999 làm app ném IndexOutOfRangeException. " +
              "Bản web KHÔNG được bắt chước; đừng viết testcase đòi web phải crash."
            : $"mã 999 không crash ở lượt này. Hộp thoại: 「{text}」");
    }
}
