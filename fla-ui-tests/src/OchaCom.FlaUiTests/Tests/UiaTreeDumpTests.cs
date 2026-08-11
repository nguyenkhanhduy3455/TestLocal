using NUnit.Framework;
using OchaCom.FlaUiTests.Infrastructure;

namespace OchaCom.FlaUiTests.Tests;

/// <summary>
/// Công cụ chẩn đoán, KHÔNG phải testcase — có <c>[Explicit]</c> nên chạy cả bộ sẽ bỏ qua.
///
/// Dùng khi một locator không khớp trên máy Windows: nó mở app, đi tới 診療入力, rồi đổ
/// cây UIA ra file để đối chiếu AutomationId/Name/ControlType thật. Sửa xong thì chỉnh
/// mục <c>locators</c> trong testsettings.json chứ đừng sửa code.
///
///   dotnet test --filter "TestCategory=diagnostics"
/// </summary>
[TestFixture]
[Category("diagnostics")]
[Explicit("Công cụ chẩn đoán locator, chạy tay khi cần")]
public sealed class UiaTreeDumpTests : UiTestBase
{
    [Test]
    [Description("Đổ cây UIA của màn 診療入力 ra file để dò AutomationId")]
    public void DumpTreatmentEntryTree()
    {
        var dir = Path.Combine(AppContext.BaseDirectory, "artifacts");
        Directory.CreateDirectory(dir);

        var whole = Path.Combine(dir, $"frm203002-tree-{DateTime.Now:yyyyMMdd-HHmmss}.txt");
        File.WriteAllText(whole, Uia.DumpTree(Screen.Window, maxDepth: 10, maxChildrenPerNode: 60));
        TestContext.AddTestAttachment(whole, "Cây UIA của frm203002");
        TestContext.Out.WriteLine($"Đã ghi: {whole}");

        // Riêng lưới 個別: đổ RIÊNG và cắt số dòng, vì lưới có ~1.7k dòng ⇒ đổ hết là treo.
        Screen.Kobetu.Open();
        Screen.Kobetu.SearchByCode(333, expectAtLeast: 0);

        var grid = Path.Combine(dir, $"hfgKobetu-{DateTime.Now:yyyyMMdd-HHmmss}.txt");
        File.WriteAllText(grid, Uia.DumpTree(Screen.Kobetu.Grid.Element, maxDepth: 4, maxChildrenPerNode: 20));
        TestContext.AddTestAttachment(grid, "Cây UIA của hfgKobetu sau khi lọc mã 333");
        TestContext.Out.WriteLine($"Đã ghi: {grid}");

        TestContext.Out.WriteLine("Header đọc được: " + string.Join(" | ", Screen.Kobetu.Grid.Headers()));
        foreach (var row in Screen.Kobetu.Grid.Rows(limit: 5))
        {
            TestContext.Out.WriteLine($"  giá trị : {row}");
            TestContext.Out.WriteLine($"  mô tả ô : {string.Join(" | ", row.CellDescriptions)}");
        }
    }
}
