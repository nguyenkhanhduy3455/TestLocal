using FlaUI.Core.WindowsAPI;
using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;
using OchaCom.FlaUiTests.Screens;

namespace OchaCom.FlaUiTests.Tests.TreatmentGrid;

/// <summary>
/// <b>PROBE</b> — PageUp / PageDown trên lưới 処置 (grdRegi). KHÔNG assert, KHÔNG ghi DB.
///
/// <para>grdRegi_KeyDown (frm203002.cs:3551) không bắt hai phím này nên chúng rơi về
/// DataGridView.ProcessNextKey / ProcessPriorKey. Probe đo trên app THẬT: sau mỗi phím,
/// ô hiện tại nằm ở dòng nào, khung nhìn đang hiện dòng nào tới dòng nào, và dòng của ô
/// hiện tại đứng ở VỊ TRÍ THỨ MẤY trong khung (đầu / giữa / cuối).</para>
///
/// <para>Mỗi bước in một dòng <c>=== KQ-PG ===</c> và chụp ảnh. Chạy:
/// <c>.\run-page-key-probe.ps1 -PatNo 3948 -TrtDt 2026-06-28</c>.</para>
/// </summary>
[TestFixture]
[Category("treatment-grid")]
[Explicit]
public sealed class TreatmentGridPageKeyProbeTests : UiTestBase
{
    private TreatmentGridOps _grid = null!;
    private TestTrace _trace = null!;

    [OneTimeSetUp]
    public void PageKeyProbeOneTimeSetUp() => _grid = new TreatmentGridOps(Screen);

    private static void Log(string line)
    {
        TestContext.Out.WriteLine(line);
        try { TestContext.Progress.WriteLine(line); }
        catch { /* không có console */ }
    }

    /// <summary>
    /// Các dòng nằm TRỌN trong khung lưới. UIA phơi cả dòng ngoài khung, nên lọc theo
    /// toạ độ: dòng ngoài khung có rect rỗng hoặc nằm ngoài rect của lưới.
    /// </summary>
    private List<RegiRow> VisibleRows()
    {
        var grid = Screen.Regi.Grid.Element.BoundingRectangle;
        return _grid.Snapshot()
            .Where(r =>
            {
                var b = r.Element.BoundingRectangle;
                return b.Height > 0 && b.Top >= grid.Top - 1 && b.Bottom <= grid.Bottom + 1;
            })
            .ToList();
    }

    /// <summary>Khung nhìn + ô hiện tại, gọn một dòng. Không bao giờ ném.</summary>
    private string View()
    {
        try
        {
            var rows = VisibleRows();
            var focused = _grid.FocusedCellName();
            var focusRowName = "";
            try
            {
                var f = Screen.Automation.FocusedElement();
                focusRowName = f?.Parent is null ? "" : Txt.N(Uia.LegacyNameOf(f.Parent));
            }
            catch { /* ô đang sửa không có Parent là dòng */ }
            var pos = -1;
            for (var i = 0; i < rows.Count; i++)
            {
                if (Txt.N(Uia.LegacyNameOf(rows[i].Element)) == focusRowName) { pos = i; break; }
            }
            string Row(RegiRow r) => $"{Txt.N(Uia.LegacyNameOf(r.Element))}『{r.Day}|{r.Ryo}』";
            return rows.Count == 0
                ? $"(lưới rỗng) focus=「{focused}」"
                : $"hiện {rows.Count} dòng: đầu={Row(rows[0])} cuối={Row(rows[^1])} | " +
                  $"focus=「{focused}」 dòng=「{focusRowName}」 vị-trí-trong-khung={pos}/{rows.Count - 1}";
        }
        catch (Exception e) { return $"(không đọc được: {e.Message})"; }
    }

    private void Step(string what, Action? action = null)
    {
        try
        {
            action?.Invoke();
            Waits.Step();
            Thread.Sleep(400);
        }
        catch (Exception e) { Log($"=== KQ-PG === {what}: NÉM {e.GetType().Name}: {e.Message}"); }
        Log($"=== KQ-PG === {what}: {View()}");
        try { _trace.Shot(what); } catch { /* ảnh hỏng không làm hỏng probe */ }
    }

    [Test]
    [Description("Probe — PageUp/PageDown trên grdRegi: ô hiện tại + khung nhìn sau mỗi phím")]
    public void Probe_PageUpPageDown()
    {
        using var trace = TestTrace.Begin();
        _trace = trace;

        Step("00-mo-man");

        var rows = VisibleRows();
        if (rows.Count == 0) { Log("=== KQ-PG === lưới rỗng — dừng"); return; }

        // Đứng ở ô 療法・処置 của dòng ĐẦU đang hiện.
        Step("01-click-dong-dau", () => _grid.FocusCell(rows[0], RegiGrid.Col.Ryo));
        for (var i = 1; i <= 3; i++) Step($"1{i}-PageDown-{i}", () => _grid.Press(VirtualKeyShort.NEXT));
        for (var i = 1; i <= 3; i++) Step($"2{i}-PageUp-{i}", () => _grid.Press(VirtualKeyShort.PRIOR));

        // Đứng ở dòng GIỮA khung rồi PageDown / PageUp.
        rows = VisibleRows();
        if (rows.Count > 2)
        {
            var mid = rows[rows.Count / 2];
            Step("31-click-dong-giua", () => _grid.FocusCell(mid, RegiGrid.Col.Ryo));
            Step("32-PageDown", () => _grid.Press(VirtualKeyShort.NEXT));
            Step("33-PageUp", () => _grid.Press(VirtualKeyShort.PRIOR));
        }

        // Đứng ở dòng CUỐI khung rồi PageDown.
        rows = VisibleRows();
        Step("41-click-dong-cuoi", () => _grid.FocusCell(rows[^1], RegiGrid.Col.Ryo));
        Step("42-PageDown", () => _grid.Press(VirtualKeyShort.NEXT));
    }
}
